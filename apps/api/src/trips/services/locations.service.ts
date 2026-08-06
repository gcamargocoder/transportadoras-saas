import { Injectable, NotFoundException } from '@nestjs/common';
import { Location, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLocationDto } from '../dto/create-location.dto';
import { FindLocationsQueryDto } from '../dto/find-locations-query.dto';
import { LocationEntity } from '../entities/location.entity';
import { PaginatedLocationsEntity } from '../entities/paginated-locations.entity';
import { toLocationEntity } from '../mappers/location.mapper';

// Mesmo escopo minimo de CustomersService: create/list/get, sem update/
// delete (Trip.origin/destination usam onDelete: Restrict de proposito).
@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenantId: string, query: FindLocationsQueryDto): Promise<PaginatedLocationsEntity> {
    const where: Prisma.LocationWhereInput = {
      tenantId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.location.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.location.count({ where }),
    ]);

    const result = new PaginatedLocationsEntity();
    result.items = items.map(toLocationEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<LocationEntity> {
    return toLocationEntity(await this.findActiveOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateLocationDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<LocationEntity> {
    const location = await this.prisma.location.create({
      data: { tenantId, name: dto.name, type: dto.type, ...compact({ address: dto.address }) },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'location.created',
      entityName: 'Location',
      entityId: location.id,
      newValue: toJsonSafe({ name: location.name, type: location.type }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toLocationEntity(location);
  }

  async findActiveOrThrow(tenantId: string, id: string): Promise<Location> {
    const location = await this.prisma.location.findFirst({ where: { id, tenantId } });
    if (!location) {
      throw new NotFoundException('Local nao encontrado.');
    }
    return location;
  }
}
