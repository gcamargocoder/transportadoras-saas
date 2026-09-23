import { describe, expect, it } from 'vitest';
import type { KpiResultEntity } from '../../types/entities';
import { formatKpiAbsoluteChange, formatKpiValue, formatPercentChange, resolveTrendTone } from './kpi-format';

function trend(direction: KpiResultEntity['direction'], absoluteChange: number | null, value: number | null = 10) {
  return resolveTrendTone({
    direction,
    value,
    comparison:
      absoluteChange === null
        ? { period: { start: '', end: '' }, value: null, absoluteChange: null, percentChange: null, unavailableReason: 'x' }
        : { period: { start: '', end: '' }, value: 5, absoluteChange, percentChange: 10, unavailableReason: null },
  });
}

describe('formatKpiValue', () => {
  it('formata por unidade', () => {
    expect(formatKpiValue('BRL', 1234.5)).toMatch(/R\$\s?1\.234,50/);
    expect(formatKpiValue('BRL_PER_KM', 1.2)).toMatch(/R\$\s?1,20\/km/);
    expect(formatKpiValue('PERCENT', 87.456)).toBe('87,5%');
    expect(formatKpiValue('KM', 12500)).toBe('12.500 km');
    expect(formatKpiValue('HOURS', 12.34)).toBe('12,3 h');
    expect(formatKpiValue('COUNT', 1500)).toBe('1.500');
  });

  it('indisponivel vira travessao (nunca 0)', () => {
    expect(formatKpiValue('BRL', null)).toBe('—');
  });
});

describe('variacoes', () => {
  it('percentual e absoluta com sinal; PERCENT em pontos percentuais', () => {
    expect(formatPercentChange(12.34)).toBe('+12,3%');
    expect(formatPercentChange(-5)).toBe('−5,0%');
    expect(formatKpiAbsoluteChange('PERCENT', -2.5)).toBe('−2,5 p.p.');
    expect(formatKpiAbsoluteChange('COUNT', 3)).toBe('+3');
  });
});

describe('resolveTrendTone (cor = melhora/piora, nao subida/descida)', () => {
  it('maior e melhor', () => {
    expect(trend('HIGHER_IS_BETTER', 5)).toBe('positive');
    expect(trend('HIGHER_IS_BETTER', -5)).toBe('negative');
  });

  it('menor e melhor (ex: custo/km caindo e bom)', () => {
    expect(trend('LOWER_IS_BETTER', -5)).toBe('positive');
    expect(trend('LOWER_IS_BETTER', 5)).toBe('negative');
  });

  it('neutro, sem variacao e sem base', () => {
    expect(trend('NEUTRAL', 5)).toBe('neutral');
    expect(trend('HIGHER_IS_BETTER', 0)).toBe('neutral');
    expect(trend('HIGHER_IS_BETTER', null)).toBe('unavailable');
    expect(trend('HIGHER_IS_BETTER', 5, null)).toBe('unavailable');
  });
});
