import { Injectable } from '@nestjs/common';
import { ContractStatus, ExpenseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FindFreightDashboardQueryDto } from '../dto/find-freight-dashboard-query.dto';
import {
  ExpiringContractEntity,
  FreightDashboardEntity,
  FreightTopCustomerEntity,
  FreightTopRouteEntity,
  FreightTopTableEntity,
} from '../entities/freight-dashboard.entity';

const CONTRACT_EXPIRING_WINDOW_DAYS = 30;
const TOP_LIST_LIMIT = 10;

const DASHBOARD_ROW_SELECT = {
  tripId: true,
  contractedAmount: true,
  finalAmount: true,
  estimatedAmount: true,
  freightTableId: true,
  freightTable: { select: { name: true } },
  trip: {
    select: {
      customerId: true,
      customer: { select: { name: true } },
      origin: { select: { name: true } },
      destination: { select: { name: true } },
    },
  },
} satisfies Prisma.TripFreightSelect;

type DashboardRow = Prisma.TripFreightGetPayload<{ select: typeof DASHBOARD_ROW_SELECT }>;
type BestAmountFn = (row: DashboardRow) => number | null;

@Injectable()
export class FreightDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(tenantId: string, query: FindFreightDashboardQueryDto): Promise<FreightDashboardEntity> {
    const where = this.buildWhere(tenantId, query);

    // Lote unico com tudo que os agregados abaixo precisam -- nenhuma
    // query extra por cliente/rota/tabela (secao 14).
    const rows: DashboardRow[] = await this.prisma.tripFreight.findMany({
      where,
      select: DASHBOARD_ROW_SELECT,
    });

    const tripIds = rows.map((row) => row.tripId);

    const [revenueAgg, expenseAgg, fuelAgg, tollAgg, expiringContracts, tripsWithoutApplicableRuleCount] =
      await Promise.all([
        this.prisma.tripRevenue.aggregate({ where: { tenantId, tripId: { in: tripIds } }, _sum: { amount: true } }),
        this.prisma.tripExpense.aggregate({
          where: { tenantId, tripId: { in: tripIds }, status: ExpenseStatus.APPROVED },
          _sum: { amount: true },
        }),
        this.prisma.fuelSupply.aggregate({ where: { tenantId, tripId: { in: tripIds } }, _sum: { totalAmount: true } }),
        this.prisma.tollTransaction.aggregate({
          where: { tenantId, tripId: { in: tripIds } },
          _sum: { chargedAmount: true },
        }),
        this.getExpiringContracts(tenantId),
        this.countTripsWithoutApplicableRule(tenantId, query),
      ]);

    const bestAmount: BestAmountFn = (row) => {
      if (row.contractedAmount != null) return Number(row.contractedAmount);
      if (row.finalAmount != null) return Number(row.finalAmount);
      if (row.estimatedAmount != null) return Number(row.estimatedAmount);
      return null;
    };

    const usableRows = rows.filter((row) => bestAmount(row) !== null);
    const contractedAmountTotal = usableRows.reduce((sum, row) => sum + (bestAmount(row) ?? 0), 0);
    const freightsCount = usableRows.length;
    const averageTicket = freightsCount > 0 ? round2(contractedAmountTotal / freightsCount) : null;

    const realizedRevenueTotal = Number(revenueAgg._sum.amount ?? 0);
    const fuelCost = Number(fuelAgg._sum.totalAmount ?? 0);
    const tollCost = Number(tollAgg._sum.chargedAmount ?? 0);
    const realizedCostTotal = Number(expenseAgg._sum.amount ?? 0) + fuelCost + tollCost;
    const projectedMarginTotal = round2(contractedAmountTotal - realizedCostTotal);
    const realResultTotal = round2(realizedRevenueTotal - realizedCostTotal);
    const resultDifferenceTotal = round2(realResultTotal - projectedMarginTotal);

    const entity = new FreightDashboardEntity();
    entity.contractedAmountTotal = round2(contractedAmountTotal);
    entity.freightsCount = freightsCount;
    entity.averageTicket = averageTicket;
    entity.realizedRevenueTotal = round2(realizedRevenueTotal);
    entity.realizedCostTotal = round2(realizedCostTotal);
    entity.projectedMarginTotal = projectedMarginTotal;
    entity.realResultTotal = realResultTotal;
    entity.resultDifferenceTotal = resultDifferenceTotal;
    entity.topCustomers = this.buildTopCustomers(usableRows, bestAmount);
    entity.topRoutes = this.buildTopRoutes(usableRows, bestAmount);
    entity.topFreightTables = this.buildTopFreightTables(usableRows, bestAmount);
    entity.contractsExpiringSoon = expiringContracts;
    entity.tripsWithoutApplicableRuleCount = tripsWithoutApplicableRuleCount;
    return entity;
  }

  private buildWhere(tenantId: string, query: FindFreightDashboardQueryDto): Prisma.TripFreightWhereInput {
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
      ...(query.customerId ? { trip: { customerId: query.customerId } } : {}),
    };
  }

  private buildTopCustomers(rows: DashboardRow[], bestAmount: BestAmountFn): FreightTopCustomerEntity[] {
    const grouped = new Map<string, { name: string; totalAmount: number; freightsCount: number }>();
    for (const row of rows) {
      if (!row.trip.customerId) continue;
      const amount = bestAmount(row) ?? 0;
      const existing = grouped.get(row.trip.customerId);
      if (existing) {
        existing.totalAmount += amount;
        existing.freightsCount += 1;
      } else {
        grouped.set(row.trip.customerId, {
          name: row.trip.customer?.name ?? 'Cliente',
          totalAmount: amount,
          freightsCount: 1,
        });
      }
    }
    return [...grouped.entries()]
      .sort((a, b) => b[1].totalAmount - a[1].totalAmount)
      .slice(0, TOP_LIST_LIMIT)
      .map(([customerId, data]) => {
        const entity = new FreightTopCustomerEntity();
        entity.customerId = customerId;
        entity.customerName = data.name;
        entity.totalAmount = round2(data.totalAmount);
        entity.freightsCount = data.freightsCount;
        return entity;
      });
  }

  private buildTopRoutes(rows: DashboardRow[], bestAmount: BestAmountFn): FreightTopRouteEntity[] {
    const grouped = new Map<
      string,
      { originName: string | null; destinationName: string | null; totalAmount: number; freightsCount: number }
    >();
    for (const row of rows) {
      const originName = row.trip.origin?.name ?? null;
      const destinationName = row.trip.destination?.name ?? null;
      const key = `${originName ?? ''}::${destinationName ?? ''}`;
      const amount = bestAmount(row) ?? 0;
      const existing = grouped.get(key);
      if (existing) {
        existing.totalAmount += amount;
        existing.freightsCount += 1;
      } else {
        grouped.set(key, { originName, destinationName, totalAmount: amount, freightsCount: 1 });
      }
    }
    return [...grouped.values()]
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, TOP_LIST_LIMIT)
      .map((data) => {
        const entity = new FreightTopRouteEntity();
        entity.originName = data.originName;
        entity.destinationName = data.destinationName;
        entity.totalAmount = round2(data.totalAmount);
        entity.freightsCount = data.freightsCount;
        return entity;
      });
  }

  private buildTopFreightTables(rows: DashboardRow[], bestAmount: BestAmountFn): FreightTopTableEntity[] {
    const grouped = new Map<string, { name: string; totalAmount: number; freightsCount: number }>();
    for (const row of rows) {
      if (!row.freightTableId) continue;
      const amount = bestAmount(row) ?? 0;
      const existing = grouped.get(row.freightTableId);
      if (existing) {
        existing.totalAmount += amount;
        existing.freightsCount += 1;
      } else {
        grouped.set(row.freightTableId, {
          name: row.freightTable?.name ?? 'Tabela',
          totalAmount: amount,
          freightsCount: 1,
        });
      }
    }
    return [...grouped.entries()]
      .sort((a, b) => b[1].totalAmount - a[1].totalAmount)
      .slice(0, TOP_LIST_LIMIT)
      .map(([freightTableId, data]) => {
        const entity = new FreightTopTableEntity();
        entity.freightTableId = freightTableId;
        entity.freightTableName = data.name;
        entity.totalAmount = round2(data.totalAmount);
        entity.freightsCount = data.freightsCount;
        return entity;
      });
  }

  private async getExpiringContracts(tenantId: string): Promise<ExpiringContractEntity[]> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + CONTRACT_EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const contracts = await this.prisma.contract.findMany({
      where: {
        tenantId,
        status: ContractStatus.ACTIVE,
        endDate: { gte: now, lte: windowEnd },
      },
      include: { customer: { select: { name: true } } },
      orderBy: { endDate: 'asc' },
      take: TOP_LIST_LIMIT,
    });
    return contracts.map((contract) => {
      const entity = new ExpiringContractEntity();
      entity.id = contract.id;
      entity.code = contract.code;
      entity.customerName = contract.customer.name;
      // endDate nunca e null aqui (filtrado acima) -- garantido pelo where.
      entity.endDate = contract.endDate as Date;
      return entity;
    });
  }

  /// Viagens com cliente definido, no mesmo escopo de periodo/cliente do
  /// dashboard, que nunca tiveram uma cotacao comercial aplicada OU
  /// tiveram uma tentativa sem nenhuma regra compativel encontrada
  /// (TripFreight.estimatedAmount null) -- 1 unica query (filtro de
  /// relacao opcional do Prisma), nunca 1 por viagem.
  private async countTripsWithoutApplicableRule(
    tenantId: string,
    query: FindFreightDashboardQueryDto,
  ): Promise<number> {
    return this.prisma.trip.count({
      where: {
        tenantId,
        deletedAt: null,
        customerId: query.customerId ? query.customerId : { not: null },
        ...(query.startDate || query.endDate
          ? {
              createdAt: {
                ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
                ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
              },
            }
          : {}),
        OR: [{ freight: null }, { freight: { estimatedAmount: null } }],
      },
    });
  }
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
