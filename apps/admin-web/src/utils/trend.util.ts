import type { DashboardChartPointEntity } from '../types/entities';

export interface Trend {
  value: string;
  direction: 'up' | 'down';
  favorable: boolean;
}

// Deriva "este mes vs mes anterior" a partir de uma serie mensal que a API
// JA retorna hoje (DashboardEntity.charts.monthly*) -- nunca inventa dado
// nem faz nova chamada. direction indica o significado de negocio de uma
// alta: 'higherIsBetter' (receita, viagens) ou 'lowerIsBetter' (despesas,
// custo de combustivel).
export function computeMonthOverMonthTrend(
  series: DashboardChartPointEntity[],
  direction: 'higherIsBetter' | 'lowerIsBetter' = 'higherIsBetter',
): Trend | null {
  if (series.length < 2) return null;

  const last = series[series.length - 1]?.value ?? 0;
  const previous = series[series.length - 2]?.value ?? 0;
  if (previous === 0) return null;

  const change = ((last - previous) / Math.abs(previous)) * 100;
  const rose = change >= 0;

  return {
    value: `${rose ? '+' : ''}${change.toFixed(1)}% vs mês anterior`,
    direction: rose ? 'up' : 'down',
    favorable: direction === 'higherIsBetter' ? rose : !rose,
  };
}
