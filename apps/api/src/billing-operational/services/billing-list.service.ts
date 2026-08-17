import { Injectable } from '@nestjs/common';
import { Prisma, TripBillingStatus } from '@prisma/client';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { PrismaService } from '../../prisma/prisma.service';
import { FindTripBillingsQueryDto } from '../dto/find-trip-billings-query.dto';
import { PaginatedTripBillingsEntity } from '../entities/paginated-trip-billings.entity';
import { toTripBillingEntity, TripBillingWithRelations } from '../mappers/trip-billing.mapper';

const LIST_INCLUDE = {
  entries: { include: { creator: true }, orderBy: { createdAt: 'asc' } },
  creator: true,
  updater: true,
  canceller: true,
  trip: {
    select: {
      customerId: true,
      customer: { select: { name: true } },
      origin: { select: { name: true } },
      destination: { select: { name: true } },
      freight: { select: { contractedAmount: true, estimatedAmount: true } },
    },
  },
} satisfies Prisma.TripBillingInclude;

type ListRow = Prisma.TripBillingGetPayload<{ include: typeof LIST_INCLUDE }>;

@Injectable()
export class BillingListService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: FindTripBillingsQueryDto): Promise<PaginatedTripBillingsEntity> {
    const where = buildBillingWhere(tenantId, query);

    const [items, total] = await Promise.all([
      this.prisma.tripBilling.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tripBilling.count({ where }),
    ]);

    const result = new PaginatedTripBillingsEntity();
    result.items = items.map((item: ListRow) =>
      toTripBillingEntity(item as unknown as TripBillingWithRelations, {
        tripLabel: `${item.trip.origin.name} → ${item.trip.destination.name}`,
        customerId: item.trip.customerId,
        customerName: item.trip.customer?.name ?? null,
        contractedAmount: toNumberOrNull(item.trip.freight?.contractedAmount ?? null),
        calculatedAmount: toNumberOrNull(item.trip.freight?.estimatedAmount ?? null),
      }),
    );
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }
}

// Reaproveitado pelo BillingDashboardService (mesmo escopo de filtro).
export interface BillingScopeFilter {
  startDate?: string;
  endDate?: string;
  customerId?: string;
  fleetId?: string;
  vehicleId?: string;
  driverId?: string;
  status?: TripBillingStatus;
}

export function buildBillingWhere(tenantId: string, query: BillingScopeFilter): Prisma.TripBillingWhereInput {
  return {
    tenantId,
    ...(query.startDate || query.endDate
      ? {
          createdAt: {
            ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
            ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
          },
        }
      : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId || query.fleetId || query.vehicleId || query.driverId
      ? {
          trip: {
            ...(query.customerId ? { customerId: query.customerId } : {}),
            ...(query.driverId ? { driverId: query.driverId } : {}),
            ...(query.vehicleId || query.fleetId
              ? {
                  composition: {
                    ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
                    ...(query.fleetId ? { vehicle: { fleetId: query.fleetId } } : {}),
                  },
                }
              : {}),
          },
        }
      : {}),
  };
}
