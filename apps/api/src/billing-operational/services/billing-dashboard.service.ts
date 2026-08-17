import { Injectable } from '@nestjs/common';
import { ExpenseStatus, Prisma, TripBillingStatus } from '@prisma/client';
import { aggregateMonthlySeries } from '../../common/utils/monthly-series.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { PrismaService } from '../../prisma/prisma.service';
import { FindBillingDashboardQueryDto } from '../dto/find-billing-dashboard-query.dto';
import {
  BillingDashboardEntity,
  BillingTopCustomerEntity,
  BillingTopFleetEntity,
  BillingTopVehicleEntity,
} from '../entities/billing-dashboard.entity';
import { buildBillingWhere } from './billing-list.service';

const TOP_LIST_LIMIT = 10;

const DASHBOARD_ROW_SELECT = {
  id: true,
  status: true,
  billableAmount: true,
  invoicedAmount: true,
  createdAt: true,
  tripId: true,
  trip: {
    select: {
      customerId: true,
      customer: { select: { name: true } },
      composition: {
        select: {
          vehicleId: true,
          vehicle: { select: { plate: true, fleetId: true, fleet: { select: { name: true } } } },
        },
      },
    },
  },
} satisfies Prisma.TripBillingSelect;

type DashboardRow = Prisma.TripBillingGetPayload<{ select: typeof DASHBOARD_ROW_SELECT }>;

@Injectable()
export class BillingDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(tenantId: string, query: FindBillingDashboardQueryDto): Promise<BillingDashboardEntity> {
    const where = buildBillingWhere(tenantId, query);

    // Lote unico com tudo que os agregados abaixo precisam -- nenhuma
    // query extra por cliente/frota/veiculo (secao 12).
    const rows: DashboardRow[] = await this.prisma.tripBilling.findMany({ where, select: DASHBOARD_ROW_SELECT });
    const tripIds = rows.map((row) => row.tripId);

    const [expenseAgg, fuelAgg, tollAgg, readyForInvoicingCount] = await Promise.all([
      this.prisma.tripExpense.aggregate({
        where: { tenantId, tripId: { in: tripIds }, status: ExpenseStatus.APPROVED },
        _sum: { amount: true },
      }),
      this.prisma.fuelSupply.aggregate({ where: { tenantId, tripId: { in: tripIds } }, _sum: { totalAmount: true } }),
      this.prisma.tollTransaction.aggregate({ where: { tenantId, tripId: { in: tripIds } }, _sum: { chargedAmount: true } }),
      this.countReadyForInvoicing(tenantId, query),
    ]);

    const totalBillable = round2(rows.reduce((sum, row) => sum + (toNumberOrNull(row.billableAmount) ?? 0), 0));
    const totalInvoiced = round2(rows.reduce((sum, row) => sum + (toNumberOrNull(row.invoicedAmount) ?? 0), 0));
    const balanceToInvoice = round2(Math.max(totalBillable - totalInvoiced, 0));

    const realizedCost =
      Number(expenseAgg._sum.amount ?? 0) + Number(fuelAgg._sum.totalAmount ?? 0) + Number(tollAgg._sum.chargedAmount ?? 0);

    const partiallyInvoicedCount = rows.filter((row) => row.status === TripBillingStatus.PARTIALLY_INVOICED).length;

    const entity = new BillingDashboardEntity();
    entity.totalBillable = totalBillable;
    entity.totalInvoiced = totalInvoiced;
    entity.totalReceived = totalInvoiced;
    entity.balanceToInvoice = balanceToInvoice;
    entity.readyForInvoicingCount = readyForInvoicingCount;
    entity.partiallyInvoicedCount = partiallyInvoicedCount;
    entity.pendingCount = readyForInvoicingCount + partiallyInvoicedCount;
    entity.monthlyEvolution = aggregateMonthlySeries(
      rows.map((row) => ({ date: row.createdAt, value: toNumberOrNull(row.invoicedAmount) ?? 0 })),
    );
    entity.topCustomers = this.buildTopCustomers(rows);
    entity.topFleets = this.buildTopFleets(rows);
    entity.topVehicles = this.buildTopVehicles(rows);
    entity.commercialMargin = round2(totalInvoiced - realizedCost);
    return entity;
  }

  private buildTopCustomers(rows: DashboardRow[]): BillingTopCustomerEntity[] {
    const grouped = new Map<string, { name: string; total: number; count: number }>();
    for (const row of rows) {
      if (!row.trip.customerId) continue;
      const invoiced = toNumberOrNull(row.invoicedAmount) ?? 0;
      const existing = grouped.get(row.trip.customerId);
      if (existing) {
        existing.total += invoiced;
        existing.count += 1;
      } else {
        grouped.set(row.trip.customerId, { name: row.trip.customer?.name ?? 'Cliente', total: invoiced, count: 1 });
      }
    }
    return [...grouped.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, TOP_LIST_LIMIT)
      .map(([customerId, data]) => {
        const entity = new BillingTopCustomerEntity();
        entity.customerId = customerId;
        entity.customerName = data.name;
        entity.totalInvoiced = round2(data.total);
        entity.billingsCount = data.count;
        return entity;
      });
  }

  private buildTopFleets(rows: DashboardRow[]): BillingTopFleetEntity[] {
    const grouped = new Map<string, { name: string; total: number; count: number }>();
    for (const row of rows) {
      const fleetId = row.trip.composition?.vehicle.fleetId ?? null;
      const key = fleetId ?? '__no_fleet__';
      const invoiced = toNumberOrNull(row.invoicedAmount) ?? 0;
      const existing = grouped.get(key);
      if (existing) {
        existing.total += invoiced;
        existing.count += 1;
      } else {
        grouped.set(key, { name: row.trip.composition?.vehicle.fleet?.name ?? 'Sem frota', total: invoiced, count: 1 });
      }
    }
    return [...grouped.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, TOP_LIST_LIMIT)
      .map(([key, data]) => {
        const entity = new BillingTopFleetEntity();
        entity.fleetId = key === '__no_fleet__' ? null : key;
        entity.fleetName = data.name;
        entity.totalInvoiced = round2(data.total);
        entity.billingsCount = data.count;
        return entity;
      });
  }

  private buildTopVehicles(rows: DashboardRow[]): BillingTopVehicleEntity[] {
    const grouped = new Map<string, { plate: string; total: number; count: number }>();
    for (const row of rows) {
      if (!row.trip.composition) continue;
      const vehicleId = row.trip.composition.vehicleId;
      const invoiced = toNumberOrNull(row.invoicedAmount) ?? 0;
      const existing = grouped.get(vehicleId);
      if (existing) {
        existing.total += invoiced;
        existing.count += 1;
      } else {
        grouped.set(vehicleId, { plate: row.trip.composition.vehicle.plate, total: invoiced, count: 1 });
      }
    }
    return [...grouped.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, TOP_LIST_LIMIT)
      .map(([vehicleId, data]) => {
        const entity = new BillingTopVehicleEntity();
        entity.vehicleId = vehicleId;
        entity.plate = data.plate;
        entity.totalInvoiced = round2(data.total);
        entity.billingsCount = data.count;
        return entity;
      });
  }

  /// Viagens (no mesmo escopo de periodo/cliente/frota/veiculo/motorista)
  /// com valor comercial calculado (TripFreight) mas NUNCA faturadas
  /// ainda -- inclui tanto as que ja tem TripBilling READY quanto as que
  /// nunca tiveram nenhum faturamento iniciado. 1 unica query (filtro de
  /// relacao opcional do Prisma), nunca 1 por viagem -- mesmo padrao do
  /// "viagens sem tabela/regra aplicavel" da Fase 59.
  private async countReadyForInvoicing(tenantId: string, query: FindBillingDashboardQueryDto): Promise<number> {
    return this.prisma.trip.count({
      where: {
        tenantId,
        deletedAt: null,
        freight: { is: { estimatedAmount: { not: null } } },
        OR: [{ billing: null }, { billing: { invoicedAmount: 0 } }],
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
        ...(query.startDate || query.endDate
          ? {
              createdAt: {
                ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
                ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
              },
            }
          : {}),
      },
    });
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
