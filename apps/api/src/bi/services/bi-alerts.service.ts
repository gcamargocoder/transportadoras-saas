import { Injectable } from '@nestjs/common';
import { compact } from '../../common/utils/compact.util';
import { ALERT_RULES } from '../alerts/alert-rules';
import { AlertSeverity } from '../alerts/alert-rule.types';
import { BiAlertsQueryDto } from '../dto/bi-alerts-query.dto';
import { BiKpiSeriesQueryDto, BiKpiSummaryQueryDto } from '../dto/bi-kpi-query.dto';
import { AlertEntity, AlertsResponseEntity } from '../entities/bi-alert.entity';
import { KpiResultEntity, KpiSeriesEntity } from '../entities/bi-kpi.entity';
import { KPI_CATALOG_VERSION } from '../kpis/kpi-catalog';
import { BiKpisService } from './bi-kpis.service';

const REQUIRED_KPI_IDS = [...new Set(ALERT_RULES.map((rule) => rule.kpiId))];
const SERIES_KPI_IDS = [...new Set(ALERT_RULES.filter((rule) => rule.requiresSeries).map((rule) => rule.kpiId))];

// BI 10 -- avaliacao em lote: 1 chamada a getSummary (todos os KPIs de
// todas as regras) + no maximo 1 chamada a getSeries (so os KPIs com regra
// de desvio de periodo) -- nunca uma chamada por regra/alerta. Ambas
// reaproveitam BiKpisService.getSummary/getSeries (mesmo resolveScope,
// mesma validacao de periodo, mesmo RBAC/tenant isolation do BI 1): a
// camada de alertas nunca calcula um KPI, so LE o resultado oficial.
@Injectable()
export class BiAlertsService {
  constructor(private readonly kpisService: BiKpisService) {}

  async getAlerts(tenantId: string, query: BiAlertsQueryDto): Promise<AlertsResponseEntity> {
    const summaryQuery: BiKpiSummaryQueryDto = { ...query, kpis: REQUIRED_KPI_IDS };
    const summary = await this.kpisService.getSummary(tenantId, summaryQuery);
    const kpiById = new Map(summary.kpis.map((kpi) => [kpi.id, kpi]));

    let seriesById = new Map<string, KpiSeriesEntity>();
    if (SERIES_KPI_IDS.length > 0) {
      const seriesQuery: BiKpiSeriesQueryDto = {
        startDate: query.startDate,
        endDate: query.endDate,
        ...compact({ vehicleId: query.vehicleId, fleetId: query.fleetId, customerId: query.customerId }),
        kpis: SERIES_KPI_IDS,
        comparison: 'NONE',
      };
      const series = await this.kpisService.getSeries(tenantId, seriesQuery);
      seriesById = new Map(series.series.map((s) => [s.id, s]));
    }

    const severityFilter = query.severity ? new Set<AlertSeverity>(query.severity) : null;
    const items: AlertEntity[] = [];
    for (const rule of ALERT_RULES) {
      const kpi = kpiById.get(rule.kpiId);
      if (!kpi) continue;
      const evaluation = rule.evaluate(kpi, rule.requiresSeries ? seriesById.get(rule.kpiId) : undefined);
      if (!evaluation) continue;
      if (severityFilter && !severityFilter.has(evaluation.severity)) continue;
      items.push(this.toAlertEntity(rule, evaluation, kpi));
    }

    const entity = new AlertsResponseEntity();
    entity.catalogVersion = KPI_CATALOG_VERSION;
    entity.calculatedAt = summary.calculatedAt;
    entity.scope = summary.scope;
    entity.period = summary.period;
    entity.items = items;
    return entity;
  }

  private toAlertEntity(
    rule: (typeof ALERT_RULES)[number],
    evaluation: { severity: AlertSeverity; limitValue: number | null; referenceLabel: string },
    kpi: KpiResultEntity,
  ): AlertEntity {
    const entity = new AlertEntity();
    // Determinístico (nunca aleatório): mesma regra+KPI+escopo+período
    // sempre produz o MESMO id -- base para uma futura deduplicacao/
    // persistencia (BI 11) sem precisar recalcular nada.
    entity.id = `${rule.id}:v${rule.version}:${kpi.id}:${kpi.period.start.toISOString()}:${kpi.period.end.toISOString()}`;
    entity.ruleId = rule.id;
    entity.ruleVersion = rule.version;
    entity.name = rule.name;
    entity.description = rule.description;
    entity.severity = evaluation.severity;
    entity.conditionType = rule.conditionType;
    entity.limitValue = evaluation.limitValue;
    entity.referenceLabel = evaluation.referenceLabel;
    entity.kpi = kpi;
    return entity;
  }
}
