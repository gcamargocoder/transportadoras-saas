import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Vehicle } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVehicleDto } from '../dto/create-vehicle.dto';
import { FindVehiclesQueryDto } from '../dto/find-vehicles-query.dto';
import { UpdateVehicleStatusDto } from '../dto/update-vehicle-status.dto';
import { UpdateVehicleDto } from '../dto/update-vehicle.dto';
import { PaginatedVehiclesEntity } from '../entities/paginated-vehicles.entity';
import { VehicleEntity } from '../entities/vehicle.entity';
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
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
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

  async create(
    tenantId: string,
    dto: CreateVehicleDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<VehicleEntity> {
    const plate = normalizePlate(dto.plate);
    await this.assertUniqueFields(tenantId, {
      plate,
      renavam: dto.renavam,
      chassisNumber: dto.chassisNumber,
    });
    if (dto.fleetId) {
      await this.assertFleetBelongsToTenant(tenantId, dto.fleetId);
    }

    const vehicle = await this.prisma.vehicle.create({
      data: {
        tenantId,
        plate,
        type: dto.type,
        isActive: true,
        ...compact({
          fleetId: dto.fleetId,
          renavam: dto.renavam,
          chassisNumber: dto.chassisNumber,
          brand: dto.brand,
          model: dto.model,
          manufactureYear: dto.manufactureYear,
          modelYear: dto.modelYear,
          color: dto.color,
          category: dto.category,
          notes: dto.notes,
        }),
      },
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
      data: { isActive: dto.isActive },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'vehicle.status_changed',
      entityName: 'Vehicle',
      entityId: id,
      previousValue: { isActive: before.isActive },
      newValue: { isActive: vehicle.isActive },
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

    await this.prisma.vehicle.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'vehicle.deleted',
      entityName: 'Vehicle',
      entityId: id,
      previousValue: toJsonSafe({ plate: before.plate, isActive: before.isActive }),
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

  private async assertFleetBelongsToTenant(tenantId: string, fleetId: string): Promise<void> {
    const fleet = await this.prisma.fleet.findFirst({
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
  ): Promise<void> {
    if (fields.plate && fields.plate !== before?.plate) {
      const existing = await this.prisma.vehicle.findUnique({
        where: { tenantId_plate: { tenantId, plate: fields.plate } },
      });
      if (existing)
        throw new ConflictException('Ja existe um veiculo com esta placa nesta empresa.');
    }
    if (fields.renavam && fields.renavam !== before?.renavam) {
      const existing = await this.prisma.vehicle.findUnique({
        where: { tenantId_renavam: { tenantId, renavam: fields.renavam } },
      });
      if (existing)
        throw new ConflictException('Ja existe um veiculo com este RENAVAM nesta empresa.');
    }
    if (fields.chassisNumber && fields.chassisNumber !== before?.chassisNumber) {
      const existing = await this.prisma.vehicle.findUnique({
        where: { tenantId_chassisNumber: { tenantId, chassisNumber: fields.chassisNumber } },
      });
      if (existing)
        throw new ConflictException('Ja existe um veiculo com este chassi nesta empresa.');
    }
  }
}
