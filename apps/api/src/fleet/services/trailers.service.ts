import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Trailer } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTrailerDto } from '../dto/create-trailer.dto';
import { FindTrailersQueryDto } from '../dto/find-trailers-query.dto';
import { UpdateTrailerStatusDto } from '../dto/update-trailer-status.dto';
import { UpdateTrailerDto } from '../dto/update-trailer.dto';
import { PaginatedTrailersEntity } from '../entities/paginated-trailers.entity';
import { TrailerEntity } from '../entities/trailer.entity';
import { toTrailerEntity } from '../mappers/trailer.mapper';
import { normalizePlate } from '../utils/normalize-plate.util';

@Injectable()
export class TrailersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenantId: string, query: FindTrailersQueryDto): Promise<PaginatedTrailersEntity> {
    const where: Prisma.TrailerWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? { plate: { contains: normalizePlate(query.search), mode: Prisma.QueryMode.insensitive } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.trailer.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.trailer.count({ where }),
    ]);

    const result = new PaginatedTrailersEntity();
    result.items = items.map(toTrailerEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<TrailerEntity> {
    return toTrailerEntity(await this.findActiveOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateTrailerDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TrailerEntity> {
    const plate = normalizePlate(dto.plate);
    await this.assertPlateAvailable(tenantId, plate);

    const trailer = await this.prisma.trailer.create({
      data: {
        tenantId,
        plate,
        type: dto.type,
        isActive: true,
        ...compact({ notes: dto.notes }),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trailer.created',
      entityName: 'Trailer',
      entityId: trailer.id,
      newValue: toJsonSafe({ plate: trailer.plate, type: trailer.type }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTrailerEntity(trailer);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateTrailerDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TrailerEntity> {
    const before = await this.findActiveOrThrow(tenantId, id);

    const plate = dto.plate ? normalizePlate(dto.plate) : undefined;
    if (plate && plate !== before.plate) {
      await this.assertPlateAvailable(tenantId, plate);
    }

    const trailer = await this.prisma.trailer.update({
      where: { id },
      data: compact({ plate, type: dto.type, notes: dto.notes }),
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trailer.updated',
      entityName: 'Trailer',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(trailer),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTrailerEntity(trailer);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    dto: UpdateTrailerStatusDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TrailerEntity> {
    const before = await this.findActiveOrThrow(tenantId, id);

    const trailer = await this.prisma.trailer.update({
      where: { id },
      data: { isActive: dto.isActive },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trailer.status_changed',
      entityName: 'Trailer',
      entityId: id,
      previousValue: { isActive: before.isActive },
      newValue: { isActive: trailer.isActive },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTrailerEntity(trailer);
  }

  async softDelete(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findActiveOrThrow(tenantId, id);

    await this.prisma.trailer.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trailer.deleted',
      entityName: 'Trailer',
      entityId: id,
      previousValue: toJsonSafe({ plate: before.plate, isActive: before.isActive }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  async findActiveOrThrow(tenantId: string, id: string): Promise<Trailer> {
    const trailer = await this.prisma.trailer.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!trailer) {
      throw new NotFoundException('Implemento nao encontrado.');
    }
    return trailer;
  }

  private async assertPlateAvailable(tenantId: string, plate: string): Promise<void> {
    const existing = await this.prisma.trailer.findUnique({
      where: { tenantId_plate: { tenantId, plate } },
    });
    if (existing) {
      throw new ConflictException('Ja existe um implemento com esta placa nesta empresa.');
    }
  }
}
