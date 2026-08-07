import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FuelStation, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFuelStationDto } from '../dto/create-fuel-station.dto';
import { FindFuelStationsQueryDto } from '../dto/find-fuel-stations-query.dto';
import { UpdateFuelStationDto } from '../dto/update-fuel-station.dto';
import { PaginatedFuelStationsEntity } from '../entities/paginated-fuel-stations.entity';
import { FuelStationEntity } from '../entities/fuel-station.entity';
import { toFuelStationEntity } from '../mappers/fuel-station.mapper';

@Injectable()
export class FuelStationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(
    tenantId: string,
    query: FindFuelStationsQueryDto,
  ): Promise<PaginatedFuelStationsEntity> {
    const where: Prisma.FuelStationWhereInput = {
      tenantId,
      ...(query.state ? { state: query.state.toUpperCase() } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { city: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.fuelStation.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.fuelStation.count({ where }),
    ]);

    const result = new PaginatedFuelStationsEntity();
    result.items = items.map(toFuelStationEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<FuelStationEntity> {
    return toFuelStationEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateFuelStationDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FuelStationEntity> {
    const station = await this.prisma.fuelStation.create({
      data: {
        tenantId,
        name: dto.name,
        ...compact({
          cnpj: dto.cnpj,
          city: dto.city,
          state: dto.state?.toUpperCase(),
          isActive: dto.isActive,
        }),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'fuel_station.created',
      entityName: 'FuelStation',
      entityId: station.id,
      newValue: toJsonSafe({ name: station.name, city: station.city, state: station.state }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toFuelStationEntity(station);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateFuelStationDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FuelStationEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    const station = await this.prisma.fuelStation.update({
      where: { id },
      data: compact({
        name: dto.name,
        cnpj: dto.cnpj,
        city: dto.city,
        state: dto.state?.toUpperCase(),
        isActive: dto.isActive,
      }),
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'fuel_station.updated',
      entityName: 'FuelStation',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(station),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toFuelStationEntity(station);
  }

  async remove(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    const usageCount = await this.prisma.fuelSupply.count({ where: { fuelStationId: id } });
    if (usageCount > 0) {
      throw new ConflictException(
        `Nao e possivel excluir este posto: existem ${usageCount} abastecimento(s) vinculado(s). ` +
          'Remova-os antes de excluir o posto.',
      );
    }

    await this.prisma.fuelStation.delete({ where: { id } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'fuel_station.deleted',
      entityName: 'FuelStation',
      entityId: id,
      previousValue: toJsonSafe({ name: before.name }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  async findOwnedOrThrow(tenantId: string, id: string): Promise<FuelStation> {
    const station = await this.prisma.fuelStation.findFirst({ where: { id, tenantId } });
    if (!station) {
      throw new NotFoundException('Posto de abastecimento nao encontrado nesta empresa.');
    }
    return station;
  }
}
