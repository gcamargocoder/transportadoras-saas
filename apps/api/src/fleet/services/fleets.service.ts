import { Injectable, NotFoundException } from '@nestjs/common';
import { Fleet, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFleetDto } from '../dto/create-fleet.dto';
import { FindFleetsQueryDto } from '../dto/find-fleets-query.dto';
import { UpdateFleetStatusDto } from '../dto/update-fleet-status.dto';
import { UpdateFleetDto } from '../dto/update-fleet.dto';
import { FleetEntity } from '../entities/fleet.entity';
import { PaginatedFleetsEntity } from '../entities/paginated-fleets.entity';
import { toFleetEntity } from '../mappers/fleet.mapper';

@Injectable()
export class FleetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenantId: string, query: FindFleetsQueryDto): Promise<PaginatedFleetsEntity> {
    const where: Prisma.FleetWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.fleet.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.fleet.count({ where }),
    ]);

    const result = new PaginatedFleetsEntity();
    result.items = items.map(toFleetEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<FleetEntity> {
    return toFleetEntity(await this.findActiveOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateFleetDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FleetEntity> {
    if (dto.locationId) {
      await this.assertLocationBelongsToTenant(tenantId, dto.locationId);
    }

    const fleet = await this.prisma.fleet.create({
      data: {
        tenantId,
        name: dto.name,
        type: dto.type,
        ...compact({ locationId: dto.locationId }),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'fleet.created',
      entityName: 'Fleet',
      entityId: fleet.id,
      newValue: toJsonSafe({ name: fleet.name, type: fleet.type }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toFleetEntity(fleet);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateFleetDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FleetEntity> {
    const before = await this.findActiveOrThrow(tenantId, id);

    if (dto.locationId) {
      await this.assertLocationBelongsToTenant(tenantId, dto.locationId);
    }

    const fleet = await this.prisma.fleet.update({
      where: { id },
      data: compact({ name: dto.name, type: dto.type, locationId: dto.locationId }),
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'fleet.updated',
      entityName: 'Fleet',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(fleet),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toFleetEntity(fleet);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    dto: UpdateFleetStatusDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FleetEntity> {
    const before = await this.findActiveOrThrow(tenantId, id);

    const fleet = await this.prisma.fleet.update({
      where: { id },
      data: { isActive: dto.isActive },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'fleet.status_changed',
      entityName: 'Fleet',
      entityId: id,
      previousValue: { isActive: before.isActive },
      newValue: { isActive: fleet.isActive },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toFleetEntity(fleet);
  }

  async softDelete(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findActiveOrThrow(tenantId, id);

    await this.prisma.fleet.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'fleet.deleted',
      entityName: 'Fleet',
      entityId: id,
      previousValue: toJsonSafe({ name: before.name, isActive: before.isActive }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  async findActiveOrThrow(tenantId: string, id: string): Promise<Fleet> {
    const fleet = await this.prisma.fleet.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!fleet) {
      throw new NotFoundException('Frota nao encontrada.');
    }
    return fleet;
  }

  private async assertLocationBelongsToTenant(tenantId: string, locationId: string): Promise<void> {
    const location = await this.prisma.location.findFirst({ where: { id: locationId, tenantId } });
    if (!location) {
      throw new NotFoundException('Local (locationId) nao encontrado nesta empresa.');
    }
  }
}
