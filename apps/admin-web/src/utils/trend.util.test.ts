import { describe, expect, it } from 'vitest';
import { computeMonthOverMonthTrend } from './trend.util';

describe('computeMonthOverMonthTrend', () => {
  it('retorna null quando a série tem menos de 2 pontos', () => {
    expect(computeMonthOverMonthTrend([])).toBeNull();
    expect(computeMonthOverMonthTrend([{ month: 'Jan/26', value: 100 }])).toBeNull();
  });

  it('retorna null quando o mês anterior é zero (nunca divide por zero)', () => {
    const result = computeMonthOverMonthTrend([
      { month: 'Jan/26', value: 0 },
      { month: 'Fev/26', value: 500 },
    ]);
    expect(result).toBeNull();
  });

  it('higherIsBetter (default): alta é favorável', () => {
    const result = computeMonthOverMonthTrend([
      { month: 'Jan/26', value: 1000 },
      { month: 'Fev/26', value: 1250 },
    ]);
    expect(result).toEqual({ value: '+25.0% vs mês anterior', direction: 'up', favorable: true });
  });

  it('higherIsBetter: queda é desfavorável', () => {
    const result = computeMonthOverMonthTrend([
      { month: 'Jan/26', value: 1000 },
      { month: 'Fev/26', value: 800 },
    ]);
    expect(result).toEqual({ value: '-20.0% vs mês anterior', direction: 'down', favorable: false });
  });

  it('lowerIsBetter: alta é desfavorável mesmo com seta pra cima (ex.: despesa subindo)', () => {
    const result = computeMonthOverMonthTrend(
      [
        { month: 'Jan/26', value: 1000 },
        { month: 'Fev/26', value: 1200 },
      ],
      'lowerIsBetter',
    );
    expect(result).toEqual({ value: '+20.0% vs mês anterior', direction: 'up', favorable: false });
  });

  it('lowerIsBetter: queda é favorável (ex.: despesa caindo)', () => {
    const result = computeMonthOverMonthTrend(
      [
        { month: 'Jan/26', value: 1000 },
        { month: 'Fev/26', value: 700 },
      ],
      'lowerIsBetter',
    );
    expect(result).toEqual({ value: '-30.0% vs mês anterior', direction: 'down', favorable: true });
  });

  it('considera apenas os 2 últimos pontos mesmo com série longa', () => {
    const result = computeMonthOverMonthTrend([
      { month: 'Jan/26', value: 100 },
      { month: 'Fev/26', value: 999 },
      { month: 'Mar/26', value: 200 },
      { month: 'Abr/26', value: 100 },
    ]);
    expect(result).toEqual({ value: '-50.0% vs mês anterior', direction: 'down', favorable: false });
  });
});
