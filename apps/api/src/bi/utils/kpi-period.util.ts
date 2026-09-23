import { computeDeltaPercent, computePreviousPeriodRange } from '../../fleet-operations/utils/fleet-operations-metrics.util';

// BI 1 -- periodos de apuracao e comparacao. Funcoes puras (sem IO).
// Convencao: intervalo FECHADO [start, end] em UTC -- mesmo `gte`/`lte` ja
// usado por todos os where-builders reaproveitados (dateRangeFilter).

export interface KpiPeriod {
  start: Date;
  end: Date;
}

export const KPI_COMPARISON_MODES = ['PREVIOUS_PERIOD', 'PREVIOUS_YEAR', 'CUSTOM', 'NONE'] as const;
export type KpiComparisonMode = (typeof KPI_COMPARISON_MODES)[number];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// "2026-01-31" como FIM de periodo significa o dia 31 inteiro -- nunca a
// meia-noite do inicio do dia (que excluiria quase todo o ultimo dia).
// Mesmo recorte ja usado por FleetIdleTimeService/TripDeliveryStopsService
// (`${to}T23:59:59.999Z`). Data com hora explicita e respeitada como veio.
export function parsePeriodStart(value: string): Date {
  return DATE_ONLY.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
}

export function parsePeriodEnd(value: string): Date {
  return DATE_ONLY.test(value) ? new Date(`${value}T23:59:59.999Z`) : new Date(value);
}

// Periodo de comparacao. PREVIOUS_PERIOD reaproveita computePreviousPeriodRange
// (Fase 41, mesma regra de "periodo anterior" de /fleet-operations/costs e
// /fuel) -- nunca uma segunda definicao. PREVIOUS_YEAR desloca as duas
// pontas 1 ano para tras (sazonalidade). CUSTOM exige as duas datas. NONE
// (ou CUSTOM sem datas) = sem comparacao, nunca um periodo inventado.
export function resolveComparisonPeriod(
  mode: KpiComparisonMode,
  period: KpiPeriod,
  custom?: { start?: Date; end?: Date },
): KpiPeriod | null {
  switch (mode) {
    case 'PREVIOUS_PERIOD':
      return computePreviousPeriodRange(period.start, period.end);
    case 'PREVIOUS_YEAR':
      return { start: shiftUtcYears(period.start, -1), end: shiftUtcYears(period.end, -1) };
    case 'CUSTOM':
      return custom?.start && custom?.end ? { start: custom.start, end: custom.end } : null;
    case 'NONE':
      return null;
  }
}

function shiftUtcYears(date: Date, years: number): Date {
  const shifted = new Date(date.getTime());
  shifted.setUTCFullYear(shifted.getUTCFullYear() + years);
  return shifted;
}

// Variacao entre o valor atual e o de comparacao. Qualquer lado nulo (KPI
// indisponivel) => variacoes nulas. percentChange reaproveita
// computeDeltaPercent (null quando o anterior e 0 -- nunca Infinity).
export function computeVariation(
  current: number | null,
  previous: number | null,
): { absoluteChange: number | null; percentChange: number | null } {
  if (current === null || previous === null) return { absoluteChange: null, percentChange: null };
  return { absoluteChange: current - previous, percentChange: computeDeltaPercent(current, previous) };
}

// Divisao com guarda: null (nunca 0/NaN/Infinity) sem denominador positivo.
export function safeRatio(numerator: number, denominator: number | null): number | null {
  if (denominator === null || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}
