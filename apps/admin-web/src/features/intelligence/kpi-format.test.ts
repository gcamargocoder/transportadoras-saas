import { describe, expect, it } from 'vitest';
import type { KpiResultEntity } from '../../types/entities';
import {
  classifyRawTrend,
  formatKpiAbsoluteChange,
  formatKpiValue,
  formatPercentChange,
  resolveSeriesTrendTone,
  resolveTrendTone,
} from './kpi-format';

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

describe('classifyRawTrend (BI 7 -- primeiro x ultimo ponto da serie)', () => {
  it('sobe, desce, estavel e sem dado suficiente', () => {
    expect(classifyRawTrend(10, 15)).toBe('up');
    expect(classifyRawTrend(15, 10)).toBe('down');
    expect(classifyRawTrend(10, 10)).toBe('flat');
    expect(classifyRawTrend(null, 10)).toBe('unavailable');
    expect(classifyRawTrend(10, null)).toBe('unavailable');
  });
});

describe('resolveSeriesTrendTone (cor reaproveita direction, nao so subida/descida)', () => {
  it('maior e melhor: alta = positivo, baixa = negativo', () => {
    expect(resolveSeriesTrendTone('HIGHER_IS_BETTER', 'up')).toBe('positive');
    expect(resolveSeriesTrendTone('HIGHER_IS_BETTER', 'down')).toBe('negative');
  });

  it('menor e melhor (ex: custo/km caindo e bom): baixa = positivo, alta = negativo', () => {
    expect(resolveSeriesTrendTone('LOWER_IS_BETTER', 'down')).toBe('positive');
    expect(resolveSeriesTrendTone('LOWER_IS_BETTER', 'up')).toBe('negative');
  });

  it('neutro, estavel e sem dado suficiente', () => {
    expect(resolveSeriesTrendTone('NEUTRAL', 'up')).toBe('neutral');
    expect(resolveSeriesTrendTone('HIGHER_IS_BETTER', 'flat')).toBe('neutral');
    expect(resolveSeriesTrendTone('HIGHER_IS_BETTER', 'unavailable')).toBe('unavailable');
  });
});
