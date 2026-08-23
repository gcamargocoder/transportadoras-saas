import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTripCompositionDto } from '../dto/create-trip-composition.dto';
import { FindTripCompositionsQueryDto } from '../dto/find-trip-compositions-query.dto';
import { TripCompositionTrailerItemDto } from '../dto/trip-composition-trailer-item.dto';
import { UpdateTripCompositionDto } from '../dto/update-trip-composition.dto';
import { UpsertAxleConfigurationDto } from '../dto/upsert-axle-configuration.dto';
import { PaginatedTripCompositionsEntity } from '../entities/paginated-trip-compositions.entity';
import { TripCompositionEntity } from '../entities/trip-composition.entity';
import {
  toTripCompositionEntity,
  TripCompositionWithRelations,
} from '../mappers/trip-composition.mapper';

const COMPOSITION_INCLUDE = {
  vehicle: true,
  trailers: { include: { trailer: true }, orderBy: { positionOrder: 'asc' } },
  axleConfiguration: true,
} satisfies Prisma.TripCompositionInclude;

// Composicao = cavalo + implementos (ordenados) + config de eixos opcional.
// tripId nunca e definido aqui (ver comentario no schema e no DTO de
// criacao) -- fica pronto para a fase de Viagens associar depois.
@Injectable()
export class TripCompositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(
    tenantId: string,
    query: FindTripCompositionsQueryDto,
  ): Promise<PaginatedTripCompositionsEntity> {
    const where: Prisma.TripCompositionWhereInput = {
      tenantId,
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.tripComposition.findMany({
        where,
        include: COMPOSITION_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tripComposition.count({ where }),
    ]);

    const result = new PaginatedTripCompositionsEntity();
    result.items = items.map(toTripCompositionEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<TripCompositionEntity> {
    return toTripCompositionEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateTripCompositionDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripCompositionEntity> {
    await this.assertVehicleBelongsToTenant(tenantId, dto.vehicleId);
    if (dto.trailers?.length) {
      this.assertUniquePositions(dto.trailers);
      await this.assertTrailersBelongToTenant(
        tenantId,
        dto.trailers.map((t) => t.trailerId),
      );
    }

    const composition = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tripComposition.create({
        data: { tenantId, vehicleId: dto.vehicleId },
      });

      if (dto.trailers?.length) {
        await tx.tripCompositionTrailer.createMany({
          data: dto.trailers.map((t) => ({
            tenantId,
            tripCompositionId: created.id,
            trailerId: t.trailerId,
            positionOrder: t.positionOrder,
          })),
        });
      }

      if (dto.axleConfiguration) {
        await tx.axleConfiguration.create({
          data: { tenantId, tripCompositionId: created.id, ...dto.axleConfiguration },
        });
      }

      return created;
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_composition.created',
      entityName: 'TripComposition',
      entityId: composition.id,
      newValue: toJsonSafe({ vehicleId: dto.vehicleId, trailersCount: dto.trailers?.length ?? 0 }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.findOne(tenantId, composition.id);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateTripCompositionDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripCompositionEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    await this.assertCompositionNotLocked(before);

    if (dto.vehicleId) {
      await this.assertVehicleBelongsToTenant(tenantId, dto.vehicleId);
    }
    if (dto.trailers) {
      this.assertUniquePositions(dto.trailers);
      if (dto.trailers.length) {
        await this.assertTrailersBelongToTenant(
          tenantId,
          dto.trailers.map((t) => t.trailerId),
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // Sempre executa um update (mesmo vazio) para garantir que updatedAt
      // seja atualizado quando so a lista de implementos muda.
      await tx.tripComposition.update({
        where: { id },
        data: compact({ vehicleId: dto.vehicleId }),
      });

      if (dto.trailers) {
        await tx.tripCompositionTrailer.deleteMany({ where: { tripCompositionId: id } });
        if (dto.trailers.length) {
          await tx.tripCompositionTrailer.createMany({
            data: dto.trailers.map((t) => ({
              tenantId,
              tripCompositionId: id,
              trailerId: t.trailerId,
              positionOrder: t.positionOrder,
            })),
          });
        }
      }
    });

    const after = await this.findOwnedOrThrow(tenantId, id);

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_composition.updated',
      entityName: 'TripComposition',
      entityId: id,
      previousValue: toJsonSafe({
        vehicleId: before.vehicleId,
        trailers: before.trailers.map((t) => t.trailerId),
      }),
      newValue: toJsonSafe({
        vehicleId: after.vehicleId,
        trailers: after.trailers.map((t) => t.trailerId),
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripCompositionEntity(after);
  }

  async remove(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    // onDelete: Cascade no schema remove TripCompositionTrailer e
    // AxleConfiguration junto -- entidade sem historico proprio ate ser
    // efetivamente usada por uma viagem, por isso exclusao e definitiva
    // (nao logica, diferente de Driver/Vehicle/Trailer/Fleet).
    await this.prisma.tripComposition.delete({ where: { id } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_composition.deleted',
      entityName: 'TripComposition',
      entityId: id,
      previousValue: toJsonSafe({ vehicleId: before.vehicleId }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  async upsertAxleConfiguration(
    tenantId: string,
    id: string,
    dto: UpsertAxleConfigurationDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripCompositionEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    await this.assertCompositionNotLocked(before);

    if (before.axleConfiguration) {
      await this.prisma.axleConfiguration.update({
        where: { tripCompositionId: id },
        data: { ...dto },
      });
    } else {
      await this.prisma.axleConfiguration.create({
        data: { tenantId, tripCompositionId: id, ...dto },
      });
    }

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: before.axleConfiguration
        ? 'axle_configuration.updated'
        : 'axle_configuration.created',
      entityName: 'AxleConfiguration',
      entityId: id,
      previousValue: before.axleConfiguration ? toJsonSafe(before.axleConfiguration) : null,
      newValue: toJsonSafe(dto),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.findOne(tenantId, id);
  }

  // Fase 66 -- imutabilidade historica: uma vez que a viagem vinculada
  // efetivamente partiu (Trip.actualDeparture setado -- o MESMO sinal ja
  // usado por TripsService.updateStatus para so gravar actualDeparture na
  // PRIMEIRA transicao para IN_PROGRESS, nunca sobrescrito depois, mesmo
  // apos PAUSED/COMPLETED/CANCELLED), nem o veiculo/implementos nem a
  // configuracao de eixos da composicao podem mais ser alterados -- trocar
  // isso depois corromperia silenciosamente conciliacao de pedagio,
  // relatorios e auditoria que ja se basearam no que realmente rodou.
  // Composicoes ainda sem viagem (tripId null) ou vinculadas a uma viagem
  // que nunca partiu (PLANNED/WAITING_DRIVER/WAITING_DEPARTURE/CANCELLED
  // antes de iniciar) continuam livremente editaveis.
  private async assertCompositionNotLocked(
    composition: TripCompositionWithRelations,
  ): Promise<void> {
    if (!composition.tripId) return;
    const trip = await this.prisma.trip.findFirst({
      where: { id: composition.tripId },
      select: { actualDeparture: true },
    });
    if (trip?.actualDeparture) {
      throw new ConflictException(
        'Nao e possivel alterar veiculo/implementos/configuracao de eixos: a viagem vinculada ja partiu (composicao protegida historicamente).',
      );
    }
  }

  private async findOwnedOrThrow(
    tenantId: string,
    id: string,
  ): Promise<TripCompositionWithRelations> {
    const composition = await this.prisma.tripComposition.findFirst({
      where: { id, tenantId },
      include: COMPOSITION_INCLUDE,
    });
    if (!composition) {
      throw new NotFoundException('Composicao nao encontrada.');
    }
    return composition;
  }

  private async assertVehicleBelongsToTenant(tenantId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, tenantId, deletedAt: null },
    });
    if (!vehicle) {
      throw new NotFoundException('Veiculo (vehicleId) nao encontrado nesta empresa.');
    }
  }

  private async assertTrailersBelongToTenant(
    tenantId: string,
    trailerIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(trailerIds)];
    const trailers = await this.prisma.trailer.findMany({
      where: { id: { in: uniqueIds }, tenantId, deletedAt: null },
    });
    if (trailers.length !== uniqueIds.length) {
      throw new NotFoundException(
        'Um ou mais implementos (trailerId) nao foram encontrados nesta empresa.',
      );
    }
  }

  private assertUniquePositions(trailers: TripCompositionTrailerItemDto[]): void {
    const positions = trailers.map((t) => t.positionOrder);
    if (new Set(positions).size !== positions.length) {
      throw new ConflictException(
        'positionOrder deve ser unico entre os implementos da composicao.',
      );
    }
  }
}
