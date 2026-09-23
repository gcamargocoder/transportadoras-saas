import type { KpiResultEntity, KpiUnit } from '../../types/entities';

// BI 2 -- apresentacao dos KPIs oficiais do BI 1. Nada aqui CALCULA um KPI:
// so formata o que a API devolveu (value, comparison) e traduz a direcao
// declarada no catalogo (HIGHER/LOWER_IS_BETTER) em significado visual.

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const currencyCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decimal1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const UNIT_SUFFIX: Partial<Record<KpiUnit, string>> = {
  KM: 'km',
  LITERS: 'L',
  HOURS: 'h',
};

// Valor principal: numero + sufixo separados para a tipografia do card.
export function formatKpiValueParts(unit: KpiUnit, value: number): { value: string; suffix: string | null } {
  switch (unit) {
    case 'BRL':
      return { value: Math.abs(value) >= 1_000_000 ? currencyCompact.format(value) : currency.format(value), suffix: null };
    case 'BRL_PER_KM':
      return { value: currency.format(value), suffix: '/km' };
    case 'PERCENT':
      return { value: decimal1.format(value), suffix: '%' };
    case 'HOURS':
      return { value: Math.abs(value) >= 100 ? integer.format(value) : decimal1.format(value), suffix: 'h' };
    case 'COUNT':
      return { value: integer.format(value), suffix: null };
    default:
      return { value: integer.format(value), suffix: UNIT_SUFFIX[unit] ?? null };
  }
}

export function formatKpiValue(unit: KpiUnit, value: number | null): string {
  if (value === null) return '—';
  const parts = formatKpiValueParts(unit, value);
  if (!parts.suffix) return parts.value;
  return parts.suffix === '%' || parts.suffix === '/km' ? `${parts.value}${parts.suffix}` : `${parts.value} ${parts.suffix}`;
}

function signed(text: string, value: number): string {
  if (value > 0) return `+${text}`;
  if (value < 0) return `−${text.replace('-', '')}`;
  return text;
}

// Variacao absoluta na unidade do KPI (pontos percentuais para PERCENT).
export function formatKpiAbsoluteChange(unit: KpiUnit, change: number): string {
  if (unit === 'PERCENT') return signed(`${decimal1.format(Math.abs(change))} p.p.`, change);
  return signed(formatKpiValue(unit, Math.abs(change)), change);
}

export function formatPercentChange(change: number): string {
  return signed(`${decimal1.format(Math.abs(change))}%`, change);
}

// positive = melhorou; negative = piorou; neutral = KPI sem direcao
// (ex: distancia) ou sem variacao; unavailable = sem base de comparacao.
export type KpiTrendTone = 'positive' | 'negative' | 'neutral' | 'unavailable';

export function resolveTrendTone(kpi: Pick<KpiResultEntity, 'direction' | 'comparison' | 'value'>): KpiTrendTone {
  const change = kpi.comparison?.absoluteChange;
  if (kpi.value === null || change === null || change === undefined) return 'unavailable';
  if (change === 0 || kpi.direction === 'NEUTRAL') return 'neutral';
  const improved = kpi.direction === 'HIGHER_IS_BETTER' ? change > 0 : change < 0;
  return improved ? 'positive' : 'negative';
}

export function indexKpis(kpis: KpiResultEntity[] | undefined): Map<string, KpiResultEntity> {
  return new Map((kpis ?? []).map((kpi) => [kpi.id, kpi]));
}

export function findInput(kpi: KpiResultEntity | undefined, key: string): number | null {
  return kpi?.inputs.find((input) => input.key === key)?.value ?? null;
}
