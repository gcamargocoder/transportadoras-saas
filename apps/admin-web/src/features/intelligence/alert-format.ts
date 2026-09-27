import type { BiAlertEntity } from '../../types/entities';
import { formatKpiAbsoluteChange, formatKpiValue } from './kpi-format';
import { formatNumber } from '../../utils/format';

// BI 10 -- so formata o que o backend ja decidiu (regra + KpiResultEntity
// oficial). Nunca calcula severidade nem limite -- so monta a frase.
export function buildAlertMessage(alert: BiAlertEntity): string {
  const { kpi, conditionType, limitValue, referenceLabel } = alert;
  if (kpi.value === null) return alert.description;
  const value = formatKpiValue(kpi.unit, kpi.value);

  if (conditionType === 'ABSOLUTE_THRESHOLD' && limitValue !== null) {
    return `${kpi.name} está em ${value} (${referenceLabel} de ${formatKpiValue(kpi.unit, limitValue)}).`;
  }

  if (conditionType === 'COMPARISON_CHANGE' && kpi.comparison) {
    const pct = kpi.comparison.percentChange;
    const change = pct !== null ? `${formatNumber(Math.abs(pct), 1)}%` : formatKpiAbsoluteChange(kpi.unit, Math.abs(kpi.comparison.absoluteChange ?? 0));
    return `${kpi.name} está em ${value}, variação de ${change} em relação ao ${referenceLabel}.`;
  }

  if (conditionType === 'PERIOD_DEVIATION' && limitValue !== null) {
    return `${kpi.name} está em ${value} no intervalo mais recente, ante uma média de ${formatKpiValue(kpi.unit, limitValue)} nos demais intervalos do período.`;
  }

  return `${kpi.name} está em ${value}.`;
}
