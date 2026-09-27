import type { KpiResultEntity } from '../../types/entities';
import { formatNumber } from '../../utils/format';
import { findInput, formatKpiValue, resolveTrendTone, type KpiTrendTone } from './kpi-format';

export interface KpiInsight {
  kpiId: string;
  text: string;
  tone: KpiTrendTone;
}

// BI 9 -- motor de interpretacao: camada determinística e pura sobre o que
// o backend ja calculou (value/comparison/direction/coverage). Nunca infere
// causalidade, nunca recalcula um KPI, nunca gera frase sem base valida de
// comparacao (comparison null/UNAVAILABLE) -- nesses casos retorna null e o
// KPI simplesmente nao aparece em "O que mudou".
export function buildKpiInsight(kpi: KpiResultEntity): KpiInsight | null {
  if (kpi.value === null) return null;
  const comparison = kpi.comparison;
  if (!comparison || comparison.value === null || comparison.absoluteChange === null) return null;

  const change = comparison.absoluteChange;
  const tone = resolveTrendTone(kpi);
  const verb = change > 0 ? 'aumentou' : change < 0 ? 'diminuiu' : 'ficou estável';

  let text: string;
  if (kpi.unit === 'PERCENT') {
    text =
      change === 0
        ? `${kpi.name} ficou estável em ${formatKpiValue(kpi.unit, kpi.value)}.`
        : `${kpi.name} ${verb} de ${formatKpiValue(kpi.unit, comparison.value)} para ${formatKpiValue(kpi.unit, kpi.value)}.`;
  } else if (change === 0) {
    text = `${kpi.name} ficou estável em relação ao período anterior.`;
  } else {
    const magnitude = comparison.percentChange !== null ? `${formatNumber(Math.abs(comparison.percentChange), 1)}%` : formatKpiValue(kpi.unit, Math.abs(change));
    text = `${kpi.name} ${verb} ${magnitude} em relação ao período anterior.`;
  }

  const coverage = findInput(kpi, 'coverage');
  if (coverage !== null) text += ` Cobertura de dados: ${formatKpiValue('PERCENT', coverage)}.`;

  return { kpiId: kpi.id, text, tone };
}

export function buildInsights(kpiIds: string[], kpis: Map<string, KpiResultEntity>): KpiInsight[] {
  const insights: KpiInsight[] = [];
  for (const id of kpiIds) {
    const kpi = kpis.get(id);
    if (!kpi) continue;
    const insight = buildKpiInsight(kpi);
    if (insight) insights.push(insight);
  }
  return insights;
}
