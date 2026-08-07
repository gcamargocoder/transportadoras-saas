import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDate, formatNumber, formatPercent } from './format';

describe('formatCurrency', () => {
  it('formata valores positivos em BRL', () => {
    expect(formatCurrency(1234.5)).toBe('R$ 1.234,50');
  });

  it('trata null/undefined/NaN como zero, nunca lança erro', () => {
    expect(formatCurrency(null)).toBe('R$ 0,00');
    expect(formatCurrency(undefined)).toBe('R$ 0,00');
    expect(formatCurrency(Number.NaN)).toBe('R$ 0,00');
  });
});

describe('formatNumber', () => {
  it('retorna "-" para valores ausentes', () => {
    expect(formatNumber(null)).toBe('-');
    expect(formatNumber(undefined)).toBe('-');
  });

  it('formata com o número de casas decimais informado', () => {
    expect(formatNumber(1234.567, 1)).toBe('1.234,6');
  });
});

describe('formatPercent', () => {
  it('nunca retorna NaN%, mesmo com valor ausente', () => {
    expect(formatPercent(null)).toBe('0%');
    expect(formatPercent(undefined)).toBe('0%');
  });

  it('formata com uma casa decimal', () => {
    expect(formatPercent(12.345)).toBe('12.3%');
  });
});

describe('formatDate', () => {
  it('retorna "-" para valores ausentes ou inválidos', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate('data-invalida')).toBe('-');
  });
});
