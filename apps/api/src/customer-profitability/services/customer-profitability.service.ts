import { Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseStatus } from '@prisma/client';
import { round2 } from '../../common/utils/balance-status.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CustomerProfitabilityDashboardEntity,
  CustomerProfitabilitySummaryEntity,
} from '../entities/customer-profitability-dashboard.entity';
import { CustomerProfitabilityEntity } from '../entities/customer-profitability.entity';
import { PaginatedCustomerProfitabilityEntity } from '../entities/paginated-customer-profitability.entity';
import { FindCustomerProfitabilityDashboardQueryDto } from '../dto/find-customer-profitability-dashboard-query.dto';
import { CustomerProfitabilitySortField, FindCustomerProfitabilityQueryDto } from '../dto/find-customer-profitability-query.dto';

const TOP_LIST_LIMIT = 10;

interface PeriodFilter {
  customerId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

interface Accumulator {
  customerId: string;
  tripIds: Set<string>;
  revenue: number;
  cost: number;
}

// Fase 97 -- Rentabilidade por Cliente: consolida receita/custo/resultado
// por Customer SOMENTE a partir de fontes ja existentes (TripRevenue/
// TripExpense/FuelSupply/TollTransaction, via Trip.customerId), SEM criar
// nenhum calculo financeiro novo, SEM persistir nada e SEM tocar em
// Receivable/Payable/FinancialAccount/CashFlow (esses acompanham
// faturamento/cobranca -- um conceito distinto de "receita/custo
// realizados", mesmo raciocinio ja documentado em
// docs/trip-financial-result.md). Mesma formula de custo JA USADA por
// TripSettlementsService.getFinancialDashboard/getFinancialResult (Fases
// 51/71) -- nunca duplicada com uma regra diferente.
@Injectable()
export class CustomerProfitabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(
    tenantId: string,
    query: FindCustomerProfitabilityDashboardQueryDto,
  ): Promise<CustomerProfitabilityDashboardEntity> {
    const accumulators = await this.computeAccumulators(tenantId, { from: query.from, to: query.to });
    const rows = await this.toEntities(tenantId, accumulators);

    const summary = new CustomerProfitabilitySummaryEntity();
    summary.totalRevenue = round2(rows.reduce((sum, r) => sum + r.revenue, 0));
    summary.totalCost = round2(rows.reduce((sum, r) => sum + r.cost, 0));
    summary.totalResult = round2(summary.totalRevenue - summary.totalCost);
    summary.marginPercent = summary.totalRevenue > 0 ? round2((summary.totalResult / summary.totalRevenue) * 100) : null;
    summary.tripsCount = rows.reduce((sum, r) => sum + r.tripsCount, 0);
    summary.customersCount = rows.length;

    const entity = new CustomerProfitabilityDashboardEntity();
    entity.summary = summary;
    entity.topByResult = [...rows].sort((a, b) => b.result - a.result).slice(0, TOP_LIST_LIMIT);
    entity.topByMargin = [...rows]
      .filter((r) => r.marginPercent !== null)
      .sort((a, b) => (b.marginPercent as number) - (a.marginPercent as number))
      .slice(0, TOP_LIST_LIMIT);
    return entity;
  }

  async findAll(tenantId: string, query: FindCustomerProfitabilityQueryDto): Promise<PaginatedCustomerProfitabilityEntity> {
    const accumulators = await this.computeAccumulators(tenantId, {
      customerId: query.customerId,
      from: query.from,
      to: query.to,
    });
    const rows = await this.toEntities(tenantId, accumulators);
    const sorted = this.sortRows(rows, query.sortBy, query.sortOrder);

    const total = sorted.length;
    const start = (query.page - 1) * query.pageSize;
    const items = sorted.slice(start, start + query.pageSize);

    const result = new PaginatedCustomerProfitabilityEntity();
    result.items = items;
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  // GET /customer-profitability/customers/:customerId -- nunca 404 por
  // "sem dados": um cliente existente sem nenhuma viagem no periodo retorna
  // um registro zerado (marginPercent null, nunca 0% mascarando ausencia
  // de receita) -- so 404 quando o CLIENTE em si nao existe no tenant.
  async getForCustomer(
    tenantId: string,
    customerId: string,
    query: FindCustomerProfitabilityDashboardQueryDto,
  ): Promise<CustomerProfitabilityEntity> {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { id: true, name: true } });
    if (!customer) {
      throw new NotFoundException('Cliente (customerId) nao encontrado nesta empresa.');
    }

    const accumulators = await this.computeAccumulators(tenantId, { customerId, from: query.from, to: query.to });
    const acc = accumulators.get(customerId);

    const entity = new CustomerProfitabilityEntity();
    entity.customerId = customer.id;
    entity.customerName = customer.name;
    entity.tripsCount = acc?.tripIds.size ?? 0;
    entity.revenue = round2(acc?.revenue ?? 0);
    entity.cost = round2(acc?.cost ?? 0);
    entity.result = round2(entity.revenue - entity.cost);
    entity.marginPercent = entity.revenue > 0 ? round2((entity.result / entity.revenue) * 100) : null;
    return entity;
  }

  // Lote FIXO de queries, nunca por cliente/viagem (evita N+1 mesmo com o
  // numero de clientes/viagens crescendo): 1 findMany (viagens do escopo) +
  // 4 groupBy (receita/despesa/combustivel/pedagio, cada um agrupado por
  // tripId -- nao por cliente, porque nenhum desses models tem customerId
  // proprio confiavel; o vinculo com o cliente e SEMPRE via Trip.customerId,
  // nunca via TripRevenue.customerId, que e um campo independente/opcional
  // e pode divergir do cliente real da viagem -- ver docs/
  // customer-profitability.md).
  private async computeAccumulators(tenantId: string, filters: PeriodFilter): Promise<Map<string, Accumulator>> {
    const dateRange =
      filters.from || filters.to
        ? {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(filters.to) } : {}),
          }
        : undefined;

    const trips = await this.prisma.trip.findMany({
      where: {
        tenantId,
        deletedAt: null,
        customerId: filters.customerId ?? { not: null },
        ...(dateRange ? { plannedDeparture: dateRange } : {}),
      },
      select: { id: true, customerId: true },
    });

    const accumulators = new Map<string, Accumulator>();
    const tripCustomerMap = new Map<string, string>();
    for (const trip of trips) {
      if (!trip.customerId) continue;
      tripCustomerMap.set(trip.id, trip.customerId);
      this.ensureAccumulator(accumulators, trip.customerId).tripIds.add(trip.id);
    }

    const tripIds = [...tripCustomerMap.keys()];
    if (tripIds.length === 0) return accumulators;

    const [revenueRows, expenseRows, fuelRows, tollRows] = await Promise.all([
      this.prisma.tripRevenue.groupBy({ by: ['tripId'], where: { tenantId, tripId: { in: tripIds } }, _sum: { amount: true } }),
      this.prisma.tripExpense.groupBy({
        by: ['tripId'],
        where: { tenantId, tripId: { in: tripIds }, status: ExpenseStatus.APPROVED },
        _sum: { amount: true },
      }),
      this.prisma.fuelSupply.groupBy({ by: ['tripId'], where: { tenantId, tripId: { in: tripIds } }, _sum: { totalAmount: true } }),
      this.prisma.tollTransaction.groupBy({
        by: ['tripId'],
        where: { tenantId, tripId: { in: tripIds } },
        _sum: { chargedAmount: true },
      }),
    ]);

    for (const row of revenueRows) {
      const customerId = tripCustomerMap.get(row.tripId);
      if (!customerId) continue;
      this.ensureAccumulator(accumulators, customerId).revenue += Number(row._sum.amount ?? 0);
    }
    for (const row of expenseRows) {
      const customerId = tripCustomerMap.get(row.tripId);
      if (!customerId) continue;
      this.ensureAccumulator(accumulators, customerId).cost += Number(row._sum.amount ?? 0);
    }
    for (const row of fuelRows) {
      // FuelSupply.tripId e opcional no schema (abastecimento pode nao
      // estar vinculado a uma viagem) -- o `where: { tripId: { in: tripIds } }`
      // ja exclui nulos em tempo de execucao, este guard so satisfaz o tipo.
      if (!row.tripId) continue;
      const customerId = tripCustomerMap.get(row.tripId);
      if (!customerId) continue;
      this.ensureAccumulator(accumulators, customerId).cost += Number(row._sum.totalAmount ?? 0);
    }
    for (const row of tollRows) {
      const customerId = tripCustomerMap.get(row.tripId);
      if (!customerId) continue;
      this.ensureAccumulator(accumulators, customerId).cost += Number(row._sum.chargedAmount ?? 0);
    }

    return accumulators;
  }

  private ensureAccumulator(map: Map<string, Accumulator>, customerId: string): Accumulator {
    let acc = map.get(customerId);
    if (!acc) {
      acc = { customerId, tripIds: new Set(), revenue: 0, cost: 0 };
      map.set(customerId, acc);
    }
    return acc;
  }

  // Nomes dos clientes em UM lote (nunca por cliente -- secao N+1).
  private async toEntities(tenantId: string, accumulators: Map<string, Accumulator>): Promise<CustomerProfitabilityEntity[]> {
    if (accumulators.size === 0) return [];
    const customerIds = [...accumulators.keys()];
    const customers = await this.prisma.customer.findMany({
      where: { tenantId, id: { in: customerIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(customers.map((c) => [c.id, c.name]));

    return customerIds.map((customerId) => {
      const acc = accumulators.get(customerId) as Accumulator;
      const revenue = round2(acc.revenue);
      const cost = round2(acc.cost);
      const result = round2(revenue - cost);
      const entity = new CustomerProfitabilityEntity();
      entity.customerId = customerId;
      entity.customerName = nameById.get(customerId) ?? '—';
      entity.tripsCount = acc.tripIds.size;
      entity.revenue = revenue;
      entity.cost = cost;
      entity.result = result;
      entity.marginPercent = revenue > 0 ? round2((result / revenue) * 100) : null;
      return entity;
    });
  }

  private sortRows(
    rows: CustomerProfitabilityEntity[],
    sortBy: CustomerProfitabilitySortField,
    sortOrder: 'asc' | 'desc',
  ): CustomerProfitabilityEntity[] {
    const direction = sortOrder === 'asc' ? 1 : -1;
    const key = (row: CustomerProfitabilityEntity): number => {
      switch (sortBy) {
        case CustomerProfitabilitySortField.MARGIN:
          return row.marginPercent ?? Number.NEGATIVE_INFINITY;
        case CustomerProfitabilitySortField.REVENUE:
          return row.revenue;
        case CustomerProfitabilitySortField.COST:
          return row.cost;
        case CustomerProfitabilitySortField.TRIPS:
          return row.tripsCount;
        default:
          return row.result;
      }
    };
    return [...rows].sort((a, b) => (key(a) - key(b)) * direction);
  }
}
