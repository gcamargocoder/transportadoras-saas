import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { assertAttachmentExists } from '../../common/utils/assert-attachment-exists.util';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTripRevenueDto } from '../dto/create-trip-revenue.dto';
import { FindTripRevenuesQueryDto } from '../dto/find-trip-revenues-query.dto';
import { UpdateTripRevenueDto } from '../dto/update-trip-revenue.dto';
import { PaginatedTripRevenuesEntity } from '../entities/paginated-trip-revenues.entity';
import { TripRevenueEntity } from '../entities/trip-revenue.entity';
import { toTripRevenueEntity, TripRevenueWithRelations } from '../mappers/trip-revenue.mapper';

const REVENUE_INCLUDE = {
  customer: true,
  creator: true,
  updater: true,
} satisfies Prisma.TripRevenueInclude;

@Injectable()
export class TripRevenuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(
    tenantId: string,
    query: FindTripRevenuesQueryDto,
  ): Promise<PaginatedTripRevenuesEntity> {
    const where = this.buildWhere(tenantId, query);

    const [items, total] = await Promise.all([
      this.prisma.tripRevenue.findMany({
        where,
        include: REVENUE_INCLUDE,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tripRevenue.count({ where }),
    ]);

    const result = new PaginatedTripRevenuesEntity();
    result.items = items.map(toTripRevenueEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<TripRevenueEntity> {
    return toTripRevenueEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateTripRevenueDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripRevenueEntity> {
    await this.findTripOrThrow(tenantId, dto.tripId);

    if (dto.customerId) {
      await this.assertCustomerExists(tenantId, dto.customerId);
    }
    if (dto.attachmentId) {
      await assertAttachmentExists(this.prisma, tenantId, dto.attachmentId);
    }

    const revenue = await this.prisma.tripRevenue.create({
      data: {
        tenantId,
        tripId: dto.tripId,
        description: dto.description,
        category: dto.category,
        amount: dto.amount,
        receivedAt: new Date(dto.receivedAt),
        createdBy: actor.userId,
        ...compact({
          invoiceNumber: dto.invoiceNumber,
          customerId: dto.customerId,
          attachmentId: dto.attachmentId,
        }),
      },
      include: REVENUE_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_revenue.created',
      entityName: 'TripRevenue',
      entityId: revenue.id,
      newValue: toJsonSafe({
        tripId: revenue.tripId,
        category: revenue.category,
        amount: revenue.amount,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripRevenueEntity(revenue);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateTripRevenueDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripRevenueEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    if (dto.customerId) {
      await this.assertCustomerExists(tenantId, dto.customerId);
    }
    if (dto.attachmentId) {
      await assertAttachmentExists(this.prisma, tenantId, dto.attachmentId);
    }

    const revenue = await this.prisma.tripRevenue.update({
      where: { id },
      data: {
        ...compact({
          description: dto.description,
          category: dto.category,
          amount: dto.amount,
          receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : undefined,
          invoiceNumber: dto.invoiceNumber,
          customerId: dto.customerId,
          attachmentId: dto.attachmentId,
        }),
        updatedBy: actor.userId,
      },
      include: REVENUE_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_revenue.updated',
      entityName: 'TripRevenue',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(revenue),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripRevenueEntity(revenue);
  }

  async remove(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    await this.prisma.tripRevenue.delete({ where: { id } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_revenue.deleted',
      entityName: 'TripRevenue',
      entityId: id,
      previousValue: toJsonSafe({
        tripId: before.tripId,
        category: before.category,
        amount: before.amount,
      }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  private buildWhere(
    tenantId: string,
    query: FindTripRevenuesQueryDto,
  ): Prisma.TripRevenueWhereInput {
    return {
      tenantId,
      ...(query.tripId ? { tripId: query.tripId } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.receivedFrom || query.receivedTo
        ? {
            receivedAt: {
              ...(query.receivedFrom ? { gte: new Date(query.receivedFrom) } : {}),
              ...(query.receivedTo ? { lte: new Date(query.receivedTo) } : {}),
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

  private async assertCustomerExists(tenantId: string, customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId } });
    if (!customer) {
      throw new NotFoundException('Cliente (customerId) nao encontrado nesta empresa.');
    }
  }

  private async findTripOrThrow(tenantId: string, tripId: string): Promise<void> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, tenantId, deletedAt: null },
    });
    if (!trip) {
      throw new NotFoundException('Viagem (tripId) nao encontrada nesta empresa.');
    }
  }

  private async findOwnedOrThrow(tenantId: string, id: string): Promise<TripRevenueWithRelations> {
    const revenue = await this.prisma.tripRevenue.findFirst({
      where: { id, tenantId },
      include: REVENUE_INCLUDE,
    });
    if (!revenue) {
      throw new NotFoundException('Receita de viagem nao encontrada nesta empresa.');
    }
    return revenue;
  }
}
