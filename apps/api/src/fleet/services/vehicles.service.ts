import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TripStatus,
  Vehicle,
  VehicleMaintenanceStatus,
  VehicleStatus,
} from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { PaginatedAuditLogEntity } from '../../audit/entities/paginated-audit-log.entity';
import { toAuditLogEntity } from '../../audit/mappers/audit-log.mapper';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { PLAN_ERRORS } from '../../tenants/constants/plan-error.constants';
import { assertUnderLimit, runSerializable } from '../../tenants/utils/plan-limit.util';
import { CreateVehicleDto } from '../dto/create-vehicle.dto';
import { FindVehiclesQueryDto } from '../dto/find-vehicles-query.dto';
import { UpdateVehicleStatusDto } from '../dto/update-vehicle-status.dto';
import { UpdateVehicleDto } from '../dto/update-vehicle.dto';
import { PaginatedVehiclesEntity } from '../entities/paginated-vehicles.entity';
import { VehicleEntity } from '../entities/vehicle.entity';
import { hasActiveRelationship } from '../interfaces/vehicle-relationship-counts.interface';
import { toVehicleEntity } from '../mappers/vehicle.mapper';
import { normalizePlate } from '../utils/normalize-plate.util';

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenantId: string, query: FindVehiclesQueryDto): Promise<PaginatedVehiclesEntity> {
    const where: Prisma.VehicleWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.fleetId ? { fleetId: query.fleetId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.category
        ? { category: { contains: query.category, mode: Prisma.QueryMode.insensitive } }
        : {}),
      ...(query.manufactureYear !== undefined ? { manufactureYear: query.manufactureYear } : {}),
      ...(query.modelYear !== undefined ? { modelYear: query.modelYear } : {}),
      ...(query.plate
        ? { plate: { contains: normalizePlate(query.plate), mode: Prisma.QueryMode.insensitive } }
        : {}),
      ...(query.brand
        ? { brand: { contains: query.brand, mode: Prisma.QueryMode.insensitive } }
        : {}),
      ...(query.model
        ? { model: { contains: query.model, mode: Prisma.QueryMode.insensitive } }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                plate: {
                  contains: normalizePlate(query.search),
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              { brand: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { model: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { chassisNumber: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    const result = new PaginatedVehiclesEntity();
    result.items = items.map(toVehicleEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<VehicleEntity> {
    return toVehicleEntity(await this.findActiveOrThrow(tenantId, id));
  }

  // Historico de auditoria do veiculo (AuditService.findByEntity e generico
  // -- so filtramos entityName='Vehicle'). Confirma que o veiculo existe e
  // pertence ao tenant antes de consultar, mesmo padrao de isolamento usado
  // em todo o resto do modulo.
  async getHistory(
    tenantId: string,
    id: string,
    pagination: PaginationQueryDto,
  ): Promise<PaginatedAuditLogEntity> {
    await this.findActiveOrThrow(tenantId, id);

    const { items, total } = await this.audit.findByEntity(tenantId, 'Vehicle', id, pagination);

    const result = new PaginatedAuditLogEntity();
    result.items = items.map(toAuditLogEntity);
    result.meta = buildPaginationMeta(total, pagination.page, pagination.pageSize);
    return result;
  }

  async create(
    tenantId: string,
    dto: CreateVehicleDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<VehicleEntity> {
    const plate = normalizePlate(dto.plate);
    this.assertYearConsistency(dto.manufactureYear, dto.modelYear);

    // Fase 48 -- checagem de duplicidade + limite do plano + create numa
    // unica transacao Serializable: garante que duas criacoes concorrentes
    // nunca ultrapassem juntas o limite de veiculos do tenant.
    const vehicle = await runSerializable(this.prisma, async (tx) => {
      await this.assertUniqueFields(
        tenantId,
        { plate, renavam: dto.renavam, chassisNumber: dto.chassisNumber },
        undefined,
        tx,
      );
      if (dto.fleetId) {
        await this.assertFleetBelongsToTenant(tenantId, dto.fleetId, tx);
      }

      const plan = await tx.tenantPlan.findUnique({ where: { tenantId } });
      const count = await tx.vehicle.count({ where: { tenantId, deletedAt: null } });
      assertUnderLimit(count, plan?.maxVehicles, PLAN_ERRORS.VEHICLE_LIMIT_REACHED);

      return tx.vehicle.create({
        data: {
          tenantId,
          plate,
          type: dto.type,
          brand: dto.brand,
          model: dto.model,
          ...compact({
            fleetId: dto.fleetId,
            renavam: dto.renavam,
            chassisNumber: dto.chassisNumber,
            manufactureYear: dto.manufactureYear,
            modelYear: dto.modelYear,
            color: dto.color,
            category: dto.category,
            fuelType: dto.fuelType,
            tankCapacityLiters: dto.tankCapacityLiters,
            averageConsumptionKmL: dto.averageConsumptionKmL,
            odometerKm: dto.odometerKm,
            grossWeightKg: dto.grossWeightKg,
            netWeightKg: dto.netWeightKg,
            cargoCapacityKg: dto.cargoCapacityKg,
            axleCount: dto.axleCount,
            notes: dto.notes,
          }),
        },
      });
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'vehicle.created',
      entityName: 'Vehicle',
      entityId: vehicle.id,
      newValue: toJsonSafe({
        plate: vehicle.plate,
        type: vehicle.type,
        brand: vehicle.brand,
        model: vehicle.model,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toVehicleEntity(vehicle);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateVehicleDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<VehicleEntity> {
    const before = await this.findActiveOrThrow(tenantId, id);

    const plate = dto.plate ? normalizePlate(dto.plate) : undefined;
    this.assertYearConsistency(
      dto.manufactureYear ?? before.manufactureYear ?? undefined,
      dto.modelYear ?? before.modelYear ?? undefined,
    );
    await this.assertUniqueFields(
      tenantId,
      { plate, renavam: dto.renavam, chassisNumber: dto.chassisNumber },
      before,
    );
    if (dto.fleetId) {
      await this.assertFleetBelongsToTenant(tenantId, dto.fleetId);
    }

    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: compact({
        plate,
        fleetId: dto.fleetId,
        renavam: dto.renavam,
        chassisNumber: dto.chassisNumber,
        brand: dto.brand,
        model: dto.model,
        manufactureYear: dto.manufactureYear,
        modelYear: dto.modelYear,
        color: dto.color,
        type: dto.type,
        category: dto.category,
        fuelType: dto.fuelType,
        tankCapacityLiters: dto.tankCapacityLiters,
        averageConsumptionKmL: dto.averageConsumptionKmL,
        odometerKm: dto.odometerKm,
        grossWeightKg: dto.grossWeightKg,
        netWeightKg: dto.netWeightKg,
        cargoCapacityKg: dto.cargoCapacityKg,
        axleCount: dto.axleCount,
        notes: dto.notes,
      }),
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'vehicle.updated',
      entityName: 'Vehicle',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(vehicle),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toVehicleEntity(vehicle);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    dto: UpdateVehicleStatusDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<VehicleEntity> {
    const before = await this.findActiveOrThrow(tenantId, id);

    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: { status: dto.status },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'vehicle.status_changed',
      entityName: 'Vehicle',
      entityId: id,
      previousValue: { status: before.status },
      newValue: { status: vehicle.status },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toVehicleEntity(vehicle);
  }

  async softDelete(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findActiveOrThrow(tenantId, id);

    // "viagem em andamento" = composicao deste veiculo ligada a um Trip
    // IN_PROGRESS/PAUSED (fisicamente na estrada agora). "composicao ativa" =
    // composicao deste veiculo ainda nao concluida/cancelada (sem trip ainda,
    // ou trip em qualquer estado nao-terminal -- PLANNED, WAITING_DRIVER,
    // WAITING_DEPARTURE, IN_PROGRESS, PAUSED -- Fase 14). "manutencao aberta" =
    // VehicleMaintenance.status fora de COMPLETED/CANCELLED (Fase 13). Os
    // contadores podem se sobrepor, o que e aceitavel para a mensagem de erro
    // (mesmo padrao usado no bloqueio de exclusao de Tenant/Driver:
    // contadores informativos, nao mutuamente exclusivos).
    const NON_TERMINAL_TRIP_STATUSES = [
      TripStatus.PLANNED,
      TripStatus.WAITING_DRIVER,
      TripStatus.WAITING_DEPARTURE,
      TripStatus.IN_PROGRESS,
      TripStatus.PAUSED,
    ];
    const [activeTrips, activeCompositions, openMaintenances] = await Promise.all([
      this.prisma.tripComposition.count({
        where: {
          tenantId,
          vehicleId: id,
          trip: { status: { in: [TripStatus.IN_PROGRESS, TripStatus.PAUSED] } },
        },
      }),
      this.prisma.tripComposition.count({
        where: {
          tenantId,
          vehicleId: id,
          OR: [{ tripId: null }, { trip: { status: { in: NON_TERMINAL_TRIP_STATUSES } } }],
        },
      }),
      this.prisma.vehicleMaintenance.count({
        where: {
          tenantId,
          vehicleId: id,
          status: {
            notIn: [VehicleMaintenanceStatus.COMPLETED, VehicleMaintenanceStatus.CANCELLED],
          },
        },
      }),
    ]);
    if (hasActiveRelationship({ activeTrips, activeCompositions, openMaintenances })) {
      throw new ConflictException(
        'Nao e possivel excluir este veiculo: existem viagens ativas ' +
          `(${activeTrips} em andamento, ${activeCompositions} composicoes ativas) ou ` +
          `manutencao aberta (${openMaintenances}) vinculadas. Finalize as viagens, remova as ` +
          'composicoes e conclua/cancele as manutencoes antes de excluir o veiculo.',
      );
    }

    await this.prisma.vehicle.update({
      where: { id },
      data: { deletedAt: new Date(), status: VehicleStatus.INACTIVE },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'vehicle.deleted',
      entityName: 'Vehicle',
      entityId: id,
      previousValue: toJsonSafe({ plate: before.plate, status: before.status }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  async findActiveOrThrow(tenantId: string, id: string): Promise<Vehicle> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!vehicle) {
      throw new NotFoundException('Veiculo nao encontrado.');
    }
    return vehicle;
  }

  private assertYearConsistency(manufactureYear?: number, modelYear?: number): void {
    if (manufactureYear === undefined || modelYear === undefined) return;
    if (modelYear < manufactureYear) {
      throw new ConflictException(
        'Ano inconsistente: modelYear nao pode ser anterior a manufactureYear.',
      );
    }
  }

  // Fase 48 -- aceita opcionalmente o client de uma transacao (`tx`) para
  // create() poder rodar esta checagem dentro da mesma transacao
  // Serializable do limite do plano; update() continua chamando sem client
  // (default this.prisma), comportamento identico ao anterior.
  private async assertFleetBelongsToTenant(
    tenantId: string,
    fleetId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const fleet = await client.fleet.findFirst({
      where: { id: fleetId, tenantId, deletedAt: null },
    });
    if (!fleet) {
      throw new NotFoundException('Frota (fleetId) nao encontrada nesta empresa.');
    }
  }

  private async assertUniqueFields(
    tenantId: string,
    fields: {
      plate?: string | undefined;
      renavam?: string | undefined;
      chassisNumber?: string | undefined;
    },
    before?: Vehicle,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    if (fields.plate && fields.plate !== before?.plate) {
      const existing = await client.vehicle.findUnique({
        where: { tenantId_plate: { tenantId, plate: fields.plate } },
      });
      if (existing)
        throw new ConflictException('Ja existe um veiculo com esta placa nesta empresa.');
    }
    if (fields.renavam && fields.renavam !== before?.renavam) {
      const existing = await client.vehicle.findUnique({
        where: { tenantId_renavam: { tenantId, renavam: fields.renavam } },
      });
      if (existing)
        throw new ConflictException('Ja existe um veiculo com este RENAVAM nesta empresa.');
    }
    if (fields.chassisNumber && fields.chassisNumber !== before?.chassisNumber) {
      const existing = await client.vehicle.findUnique({
        where: { tenantId_chassisNumber: { tenantId, chassisNumber: fields.chassisNumber } },
      });
      if (existing)
        throw new ConflictException('Ja existe um veiculo com este chassi nesta empresa.');
    }
  }
}
