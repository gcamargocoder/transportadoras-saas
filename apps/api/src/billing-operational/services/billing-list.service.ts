import { Injectable } from '@nestjs/common';
import { Prisma, TripBillingStatus } from '@prisma/client';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { resolveTripFreightBestAmount } from '../../freight/utils/trip-freight-amount.util';
import { PrismaService } from '../../prisma/prisma.service';
import { FindEligibleTripsQueryDto } from '../dto/find-eligible-trips-query.dto';
import { FindTripBillingsQueryDto } from '../dto/find-trip-billings-query.dto';
import { EligibleTripForBillingEntity, PaginatedEligibleTripsForBillingEntity } from '../entities/eligible-trip-for-billing.entity';
import { PaginatedTripBillingsEntity } from '../entities/paginated-trip-billings.entity';
import { computeBillingBalance } from '../utils/billing-status.util';
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

  // Fase 103 -- "selecionar viagens elegiveis para faturamento": lista
  // Trip (nunca TripBilling, ao contrario de findAll acima) com valor
  // comercial calculado (TripFreight) e saldo a faturar -- sem
  // TripBilling ainda, ou um existente com status PARTIALLY_INVOICED
  // (INVOICED/PAID = saldo zero, CANCELLED = bloqueado, nunca elegiveis).
  // Mesma prioridade de valor (resolveTripFreightBestAmount) e mesmo
  // calculo de saldo (computeBillingBalance) ja usados pelo restante do
  // modulo -- nenhuma formula duplicada.
  async findEligibleTrips(tenantId: string, query: FindEligibleTripsQueryDto): Promise<PaginatedEligibleTripsForBillingEntity> {
    const conditions: Prisma.TripWhereInput[] = [
      { tenantId },
      { deletedAt: null },
      { freight: { OR: [{ contractedAmount: { not: null } }, { finalAmount: { not: null } }, { estimatedAmount: { not: null } }] } },
      { OR: [{ billing: null }, { billing: { status: TripBillingStatus.PARTIALLY_INVOICED } }] },
    ];
    if (query.tripStatus) conditions.push({ status: query.tripStatus });
    if (query.customerId) conditions.push({ customerId: query.customerId });
    if (query.driverId) conditions.push({ driverId: query.driverId });
    if (query.vehicleId || query.fleetId) {
      conditions.push({
        composition: {
          ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
          ...(query.fleetId ? { vehicle: { fleetId: query.fleetId } } : {}),
        },
      });
    }
    const where: Prisma.TripWhereInput = { AND: conditions };

    const [items, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        select: {
          id: true,
          status: true,
          plannedDeparture: true,
          actualArrival: true,
          customerId: true,
          customer: { select: { name: true } },
          driverId: true,
          driver: { select: { name: true } },
          origin: { select: { name: true } },
          destination: { select: { name: true } },
          composition: { select: { vehicle: { select: { id: true, plate: true } } } },
          freight: { select: { contractedAmount: true, finalAmount: true, estimatedAmount: true } },
          billing: { select: { status: true, invoicedAmount: true } },
        },
        orderBy: { actualArrival: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.trip.count({ where }),
    ]);

    const result = new PaginatedEligibleTripsForBillingEntity();
    result.items = items.map((trip) => {
      const contractedAmount = toNumberOrNull(trip.freight?.contractedAmount ?? null);
      const calculatedAmount = toNumberOrNull(trip.freight?.estimatedAmount ?? null);
      const billableAmount = resolveTripFreightBestAmount({
        contractedAmount,
        finalAmount: toNumberOrNull(trip.freight?.finalAmount ?? null),
        estimatedAmount: calculatedAmount,
      });
      const invoicedAmount = toNumberOrNull(trip.billing?.invoicedAmount ?? null) ?? 0;

      const entity = new EligibleTripForBillingEntity();
      entity.tripId = trip.id;
      entity.tripStatus = trip.status;
      entity.tripLabel = `${trip.origin.name} → ${trip.destination.name}`;
      entity.plannedDeparture = trip.plannedDeparture;
      entity.actualArrival = trip.actualArrival;
      entity.customerId = trip.customerId;
      entity.customerName = trip.customer?.name ?? null;
      entity.driverId = trip.driverId;
      entity.driverName = trip.driver?.name ?? null;
      entity.vehicleId = trip.composition?.vehicle.id ?? null;
      entity.vehiclePlate = trip.composition?.vehicle.plate ?? null;
      entity.contractedAmount = contractedAmount;
      entity.calculatedAmount = calculatedAmount;
      entity.billableAmount = billableAmount;
      entity.invoicedAmount = invoicedAmount;
      entity.balance = computeBillingBalance(billableAmount, invoicedAmount);
      entity.billingStatus = trip.billing?.status ?? null;
      return entity;
    });
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
