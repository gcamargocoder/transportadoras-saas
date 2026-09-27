import { KpiResultEntity, KpiSeriesEntity } from '../entities/bi-kpi.entity';
import { KpiDirection } from '../kpis/kpi.types';

// BI 10 -- camada de alertas: KPI -> regra -> avaliacao -> alerta. Uma regra
// NUNCA calcula um KPI (sempre le value/comparison/direction ja oficiais);
// so decide se aquele resultado merece atencao.
export const ALERT_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_CONDITION_TYPES = ['ABSOLUTE_THRESHOLD', 'COMPARISON_CHANGE', 'PERIOD_DEVIATION'] as const;
export type AlertConditionType = (typeof ALERT_CONDITION_TYPES)[number];

export interface AlertEvaluation {
  severity: AlertSeverity;
  /** Limite (ABSOLUTE_THRESHOLD) ou media do periodo (PERIOD_DEVIATION); null quando nao se aplica. */
  limitValue: number | null;
  /** Rotulo do valor de referencia, para a UI montar a frase (nunca gerada aqui). */
  referenceLabel: string;
}

export interface AlertRuleDefinition {
  /** Identificador estavel -- nunca reaproveitado para outra condicao mesmo que a regra mude. */
  id: string;
  /** Versao da regra: qualquer mudanca de limite/formula soma 1, nunca sobrescreve silenciosamente. */
  version: number;
  kpiId: string;
  name: string;
  description: string;
  conditionType: AlertConditionType;
  /** true = a regra precisa da serie oficial do periodo (Tipo C); ausencia de serie = sem alerta. */
  requiresSeries?: boolean;
  evaluate(kpi: KpiResultEntity, series?: KpiSeriesEntity): AlertEvaluation | null;
}

// Direcao ja oficial do catalogo (kpi.direction) -- nunca reinterpretada:
// so decide se uma variacao e adversa (subir e ruim quando LOWER_IS_BETTER,
// e vice-versa). NEUTRAL nunca e adverso. Mesma semantica do
// resolveTrendTone do frontend (BI2/BI7), aqui porque a severidade tem que
// nascer na regra (server), nao na interpretacao da UI.
export function isAdverseChange(direction: KpiDirection, delta: number): boolean {
  if (delta === 0 || direction === 'NEUTRAL') return false;
  return direction === 'HIGHER_IS_BETTER' ? delta < 0 : delta > 0;
}
