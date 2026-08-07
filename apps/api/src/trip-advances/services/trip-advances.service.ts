import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { assertAttachmentExists } from '../../common/utils/assert-attachment-exists.util';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTripAdvanceDto } from '../dto/create-trip-advance.dto';
import { FindTripAdvancesQueryDto } from '../dto/find-trip-advances-query.dto';
import { UpdateTripAdvanceDto } from '../dto/update-trip-advance.dto';
import { PaginatedTripAdvancesEntity } from '../entities/paginated-trip-advances.entity';
import { TripAdvanceEntity } from '../entities/trip-advance.entity';
import { toTripAdvanceEntity, TripAdvanceWithRelations } from '../mappers/trip-advance.mapper';

const ADVANCE_INCLUDE = {
  driver: true,
  creator: true,
  updater: true,
} satisfies Prisma.TripAdvanceInclude;

@Injectable()
export class TripAdvancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(
    tenantId: string,
    query: FindTripAdvancesQueryDto,
  ): Promise<PaginatedTripAdvancesEntity> {
    const where = this.buildWhere(tenantId, query);

    const [items, total] = await Promise.all([
      this.prisma.tripAdvance.findMany({
        where,
        include: ADVANCE_INCLUDE,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tripAdvance.count({ where }),
    ]);

    const result = new PaginatedTripAdvancesEntity();
    result.items = items.map(toTripAdvanceEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<TripAdvanceEntity> {
    return toTripAdvanceEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateTripAdvanceDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripAdvanceEntity> {
    const trip = await this.findTripOrThrow(tenantId, dto.tripId);
    if (!trip.driverId) {
      throw new ConflictException(
        'Esta viagem nao possui motorista vinculado -- nao e possivel registrar adiantamento.',
      );
    }

    if (dto.attachmentId) {
      await assertAttachmentExists(this.prisma, tenantId, dto.attachmentId);
    }

    const advance = await this.prisma.tripAdvance.create({
      data: {
        tenantId,
        tripId: dto.tripId,
        driverId: trip.driverId,
        description: dto.description,
        amount: dto.amount,
        paidAt: new Date(dto.paidAt),
        createdBy: actor.userId,
        ...compact({
          paymentMethod: dto.paymentMethod,
          attachmentId: dto.attachmentId,
        }),
      },
      include: ADVANCE_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_advance.created',
      entityName: 'TripAdvance',
      entityId: advance.id,
      newValue: toJsonSafe({
        tripId: advance.tripId,
        driverId: advance.driverId,
        amount: advance.amount,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripAdvanceEntity(advance);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateTripAdvanceDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripAdvanceEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    if (dto.attachmentId) {
      await assertAttachmentExists(this.prisma, tenantId, dto.attachmentId);
    }

    const advance = await this.prisma.tripAdvance.update({
      where: { id },
      data: {
        ...compact({
          description: dto.description,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
          attachmentId: dto.attachmentId,
        }),
        updatedBy: actor.userId,
      },
      include: ADVANCE_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_advance.updated',
      entityName: 'TripAdvance',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(advance),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripAdvanceEntity(advance);
  }

  async remove(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    await this.prisma.tripAdvance.delete({ where: { id } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_advance.deleted',
      entityName: 'TripAdvance',
      entityId: id,
      previousValue: toJsonSafe({
        tripId: before.tripId,
        driverId: before.driverId,
        amount: before.amount,
      }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  private buildWhere(
    tenantId: string,
    query: FindTripAdvancesQueryDto,
  ): Prisma.TripAdvanceWhereInput {
    return {
      tenantId,
      ...(query.tripId ? { tripId: query.tripId } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.paidFrom || query.paidTo
        ? {
            paidAt: {
              ...(query.paidFrom ? { gte: new Date(query.paidFrom) } : {}),
              ...(query.paidTo ? { lte: new Date(query.paidTo) } : {}),
            },
          }
        : {}),
      ...(query.minAmount !== undefined || query.maxAmount !== undefined
        ? {
            amount: {
              ...(query.minAmount !== undefined ? { gte: query.minAmount } : {}),
              ...(query.maxAmount !== undefined ? { lte: query.maxAmount } : {}),
            },
          }
        : {}),
    };
  }

  private async findTripOrThrow(tenantId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, tenantId, deletedAt: null },
    });
    if (!trip) {
      throw new NotFoundException('Viagem (tripId) nao encontrada nesta empresa.');
    }
    return trip;
  }

  private async findOwnedOrThrow(tenantId: string, id: string): Promise<TripAdvanceWithRelations> {
    const advance = await this.prisma.tripAdvance.findFirst({
      where: { id, tenantId },
      include: ADVANCE_INCLUDE,
    });
    if (!advance) {
      throw new NotFoundException('Adiantamento de viagem nao encontrado nesta empresa.');
    }
    return advance;
  }
}
