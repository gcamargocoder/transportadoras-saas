import { AlertEvaluation, AlertRuleDefinition, AlertSeverity, isAdverseChange } from './alert-rule.types';

// BI 10 -- limites e magnitudes DEFAULT, num unico ponto de verdade (nunca
// "magicos" espalhados pelas regras). Sao defaults ilustrativos do sistema,
// nao configuraveis por tenant nesta fase -- ver limitacoes do relatorio.
const THRESHOLDS = {
  costPerKm: { warning: 5, critical: 7 }, // BRL/km
  operatingMargin: { warning: 10, critical: 0 }, // %
  onTimeDeliveryRate: { warning: 85, critical: 70 }, // %
  occurrencesCritical: { warning: 1, critical: 3 }, // contagem no periodo
  fleetUtilization: { warning: 40, critical: 20 }, // %
} as const;

const CHANGE_MAGNITUDE = {
  revenue: { warning: 15, critical: 30 }, // % (percentChange)
  operatingCost: { warning: 15, critical: 30 }, // %
  onTimeDeliveryRate: { warning: 5, critical: 10 }, // p.p. (unidade PERCENT usa absoluteChange)
  occurrencesTotal: { warning: 25, critical: 50 }, // %
  fleetUtilization: { warning: 10, critical: 20 }, // p.p.
} as const;

const MIN_BUCKETS_FOR_DEVIATION = 5;

// Tipo A -- limite absoluto. "aboveIsBad" cobre custo/ocorrencias (alto e
// ruim); "belowIsBad" cobre margem/pontualidade/utilizacao (baixo e ruim).
function absoluteThresholdRule(config: {
  id: string;
  version: number;
  kpiId: string;
  name: string;
  description: string;
  aboveIsBad: boolean;
  warning: number;
  critical: number;
}): AlertRuleDefinition {
  return {
    id: config.id,
    version: config.version,
    kpiId: config.kpiId,
    name: config.name,
    description: config.description,
    conditionType: 'ABSOLUTE_THRESHOLD',
    evaluate: (kpi): AlertEvaluation | null => {
      if (kpi.value === null) return null;
      const value = kpi.value;
      const breachesWarning = config.aboveIsBad ? value >= config.warning : value <= config.warning;
      if (!breachesWarning) return null;
      const breachesCritical = config.aboveIsBad ? value >= config.critical : value <= config.critical;
      return {
        severity: breachesCritical ? 'CRITICAL' : 'WARNING',
        limitValue: breachesCritical ? config.critical : config.warning,
        referenceLabel: 'limite',
      };
    },
  };
}

// Tipo B -- variacao temporal. Le SOMENTE comparison.absoluteChange/
// percentChange ja calculados por resolveComparisonPeriod/computeVariation
// (BI 1) -- nunca recalculado aqui. Direcao favoravel gera INFO (achado,
// nao problema); so direcao adversa sobe a severidade.
function comparisonChangeRule(config: {
  id: string;
  version: number;
  kpiId: string;
  name: string;
  description: string;
  warningMagnitude: number;
  criticalMagnitude: number;
}): AlertRuleDefinition {
  return {
    id: config.id,
    version: config.version,
    kpiId: config.kpiId,
    name: config.name,
    description: config.description,
    conditionType: 'COMPARISON_CHANGE',
    evaluate: (kpi): AlertEvaluation | null => {
      const comparison = kpi.comparison;
      if (kpi.value === null || !comparison || comparison.value === null || comparison.absoluteChange === null) return null;
      const delta = comparison.absoluteChange;
      // KPIs em PERCENT comparam em pontos percentuais (mesma convencao do
      // BI 9 -- report-insights.ts); os demais, em variacao percentual.
      const magnitude = kpi.unit === 'PERCENT' ? Math.abs(delta) : comparison.percentChange !== null ? Math.abs(comparison.percentChange) : null;
      if (magnitude === null || magnitude < config.warningMagnitude) return null;
      const adverse = isAdverseChange(kpi.direction, delta);
      const severity: AlertSeverity = !adverse ? 'INFO' : magnitude >= config.criticalMagnitude ? 'CRITICAL' : 'WARNING';
      return { severity, limitValue: null, referenceLabel: 'período de comparação' };
    },
  };
}

// Tipo C -- desvio dentro do PROPRIO periodo. Baseline = media dos baldes
// da MESMA serie oficial (BiKpiSeriesService), nunca um baseline inventado
// ou historico externo; exige >= MIN_BUCKETS_FOR_DEVIATION baldes com valor,
// senao nao ha alerta (nunca "UNAVAILABLE vira 0 desvio").
function periodDeviationRule(config: {
  id: string;
  version: number;
  kpiId: string;
  name: string;
  description: string;
  multiplier: number;
  minAbsolute: number;
}): AlertRuleDefinition {
  return {
    id: config.id,
    version: config.version,
    kpiId: config.kpiId,
    name: config.name,
    description: config.description,
    conditionType: 'PERIOD_DEVIATION',
    requiresSeries: true,
    evaluate: (kpi, series): AlertEvaluation | null => {
      if (!series) return null;
      const values = series.points.map((p) => p.value).filter((v): v is number => v !== null);
      if (values.length < MIN_BUCKETS_FOR_DEVIATION) return null;
      const last = values[values.length - 1] as number;
      const priorValues = values.slice(0, -1);
      const mean = priorValues.reduce((sum, v) => sum + v, 0) / priorValues.length;
      const deviation = Math.abs(last - mean);
      const floor = Math.max(mean * config.multiplier, config.minAbsolute);
      if (deviation < floor) return null;
      const adverse = isAdverseChange(kpi.direction, last - mean);
      return { severity: adverse ? 'WARNING' : 'INFO', limitValue: mean, referenceLabel: 'média do período' };
    },
  };
}

export const ALERT_RULES: AlertRuleDefinition[] = [
  absoluteThresholdRule({
    id: 'cost_per_km_above_limit',
    version: 1,
    kpiId: 'cost_per_km',
    name: 'Custo por km acima do limite',
    description: 'Custo por km do período acima de um limite explícito.',
    aboveIsBad: true,
    warning: THRESHOLDS.costPerKm.warning,
    critical: THRESHOLDS.costPerKm.critical,
  }),
  absoluteThresholdRule({
    id: 'operating_margin_below_limit',
    version: 1,
    kpiId: 'operating_margin',
    name: 'Margem operacional baixa',
    description: 'Margem operacional do período abaixo de um limite explícito.',
    aboveIsBad: false,
    warning: THRESHOLDS.operatingMargin.warning,
    critical: THRESHOLDS.operatingMargin.critical,
  }),
  absoluteThresholdRule({
    id: 'on_time_delivery_rate_below_limit',
    version: 1,
    kpiId: 'on_time_delivery_rate',
    name: 'Pontualidade baixa',
    description: 'Percentual de entregas no prazo abaixo de um limite explícito.',
    aboveIsBad: false,
    warning: THRESHOLDS.onTimeDeliveryRate.warning,
    critical: THRESHOLDS.onTimeDeliveryRate.critical,
  }),
  absoluteThresholdRule({
    id: 'occurrences_critical_above_limit',
    version: 1,
    kpiId: 'occurrences_critical',
    name: 'Ocorrências críticas acima do limite',
    description: 'Número de ocorrências críticas no período acima de um limite explícito.',
    aboveIsBad: true,
    warning: THRESHOLDS.occurrencesCritical.warning,
    critical: THRESHOLDS.occurrencesCritical.critical,
  }),
  absoluteThresholdRule({
    id: 'fleet_utilization_below_limit',
    version: 1,
    kpiId: 'fleet_utilization',
    name: 'Utilização da frota baixa',
    description: 'Percentual de utilização da frota abaixo de um limite explícito.',
    aboveIsBad: false,
    warning: THRESHOLDS.fleetUtilization.warning,
    critical: THRESHOLDS.fleetUtilization.critical,
  }),

  comparisonChangeRule({
    id: 'revenue_relevant_change',
    version: 1,
    kpiId: 'revenue',
    name: 'Receita com variação relevante',
    description: 'Receita variou de forma relevante em relação ao período de comparação.',
    warningMagnitude: CHANGE_MAGNITUDE.revenue.warning,
    criticalMagnitude: CHANGE_MAGNITUDE.revenue.critical,
  }),
  comparisonChangeRule({
    id: 'operating_cost_relevant_change',
    version: 1,
    kpiId: 'operating_cost',
    name: 'Custo operacional com variação relevante',
    description: 'Custo operacional variou de forma relevante em relação ao período de comparação.',
    warningMagnitude: CHANGE_MAGNITUDE.operatingCost.warning,
    criticalMagnitude: CHANGE_MAGNITUDE.operatingCost.critical,
  }),
  comparisonChangeRule({
    id: 'on_time_delivery_rate_relevant_change',
    version: 1,
    kpiId: 'on_time_delivery_rate',
    name: 'Pontualidade com variação relevante',
    description: 'Pontualidade variou de forma relevante em relação ao período de comparação.',
    warningMagnitude: CHANGE_MAGNITUDE.onTimeDeliveryRate.warning,
    criticalMagnitude: CHANGE_MAGNITUDE.onTimeDeliveryRate.critical,
  }),
  comparisonChangeRule({
    id: 'occurrences_total_relevant_change',
    version: 1,
    kpiId: 'occurrences_total',
    name: 'Ocorrências com variação relevante',
    description: 'Número de ocorrências variou de forma relevante em relação ao período de comparação.',
    warningMagnitude: CHANGE_MAGNITUDE.occurrencesTotal.warning,
    criticalMagnitude: CHANGE_MAGNITUDE.occurrencesTotal.critical,
  }),
  comparisonChangeRule({
    id: 'fleet_utilization_relevant_change',
    version: 1,
    kpiId: 'fleet_utilization',
    name: 'Utilização da frota com variação relevante',
    description: 'Utilização da frota variou de forma relevante em relação ao período de comparação.',
    warningMagnitude: CHANGE_MAGNITUDE.fleetUtilization.warning,
    criticalMagnitude: CHANGE_MAGNITUDE.fleetUtilization.critical,
  }),

  periodDeviationRule({
    id: 'occurrences_total_period_deviation',
    version: 1,
    kpiId: 'occurrences_total',
    name: 'Concentração de ocorrências em um intervalo',
    description: 'Um intervalo do período concentrou muito mais ocorrências que a média dos demais intervalos do MESMO período.',
    multiplier: 1.5,
    minAbsolute: 3,
  }),
];

export function findAlertRule(id: string): AlertRuleDefinition | undefined {
  return ALERT_RULES.find((rule) => rule.id === id);
}
