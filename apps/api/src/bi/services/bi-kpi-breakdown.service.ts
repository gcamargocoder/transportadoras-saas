import { Injectable } from '@nestjs/common';
import { compact } from '../../common/utils/compact.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { FleetOperationsMetricsService } from '../../fleet-operations/services/fleet-operations-metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KpiBreakdownItemEntity } from '../entities/bi-kpi.entity';
import { BiScope } from '../utils/bi-where.util';
import { KpiPeriod } from '../utils/kpi-period.util';

export interface BreakdownResult {
  total: number;
  items: KpiBreakdownItemEntity[];
  others: KpiBreakdownItemEntity | null;
}

function item(key: string | null, label: string, value: number, recordCount: number, total: number): KpiBreakdownItemEntity {
  const entity = new KpiBreakdownItemEntity();
  entity.key = key;
  entity.label = label;
  entity.value = value;
  entity.recordCount = recordCount;
  entity.share = total > 0 ? (value / total) * 100 : null;
  return entity;
}

// BI 3 -- receita por cliente. O where e EXATAMENTE o do KPI `revenue`
// (FleetOperationsMetricsService.buildRevenueSourceWhere); o groupBy so
// particiona o mesmo conjunto de registros por TripRevenue.customerId --
// a soma das partes e o valor do KPI (testado no e2e). Custos nao entram:
// suas fontes nao tem vinculo direto e confiavel com cliente.
@Injectable()
export class BiKpiBreakdownService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fleetMetrics: FleetOperationsMetricsService,
  ) {}

  async revenueByCustomer(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const where = this.fleetMetrics.buildRevenueSourceWhere(
      tenantId,
      compact({ startDate: period.start, endDate: period.end, ...scope }),
    );
    const groups = await this.prisma.tripRevenue.groupBy({
      by: ['customerId'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });

    const rows = groups
      .map((g) => ({ customerId: g.customerId, value: toNumberOrNull(g._sum.amount) ?? 0, count: g._count._all }))
      .sort((a, b) => b.value - a.value || String(a.customerId).localeCompare(String(b.customerId)));
    const total = rows.reduce((sum, r) => sum + r.value, 0);
    const top = rows.slice(0, limit);
    const rest = rows.slice(limit);

    const ids = top.map((r) => r.customerId).filter((id): id is string => id !== null);
    const customers =
      ids.length > 0
        ? await this.prisma.customer.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true } })
        : [];
    const nameById = new Map(customers.map((c) => [c.id, c.name]));

    return {
      total,
      items: top.map((r) =>
        item(r.customerId, r.customerId ? (nameById.get(r.customerId) ?? 'Cliente removido') : 'Sem cliente', r.value, r.count, total),
      ),
      others:
        rest.length > 0
          ? item(
              null,
              `Demais (${rest.length})`,
              rest.reduce((sum, r) => sum + r.value, 0),
              rest.reduce((sum, r) => sum + r.count, 0),
              total,
            )
          : null,
    };
  }
}
