import { ConflictException } from '@nestjs/common';
import { PartStockMovementType } from '@prisma/client';
import { applyMovementDelta, assertStockNotNegative, computeIsLowStock } from './part-stock.util';

describe('computeIsLowStock', () => {
  it('retorna false quando minStock nao informado', () => {
    expect(computeIsLowStock(0, null)).toBe(false);
    expect(computeIsLowStock(100, null)).toBe(false);
  });

  it('retorna true quando currentStock <= minStock', () => {
    expect(computeIsLowStock(5, 5)).toBe(true);
    expect(computeIsLowStock(3, 5)).toBe(true);
    expect(computeIsLowStock(0, 5)).toBe(true);
  });

  it('retorna false quando currentStock > minStock', () => {
    expect(computeIsLowStock(6, 5)).toBe(false);
  });
});

describe('applyMovementDelta', () => {
  it('IN soma ao saldo', () => {
    expect(applyMovementDelta(10, PartStockMovementType.IN, 5)).toBe(15);
  });

  it('OUT subtrai do saldo', () => {
    expect(applyMovementDelta(10, PartStockMovementType.OUT, 5)).toBe(5);
  });

  it('ADJUSTMENT aplica o delta com sinal diretamente', () => {
    expect(applyMovementDelta(10, PartStockMovementType.ADJUSTMENT, -3)).toBe(7);
    expect(applyMovementDelta(10, PartStockMovementType.ADJUSTMENT, 3)).toBe(13);
  });
});

describe('assertStockNotNegative', () => {
  it('nao lanca quando o saldo resultante e >= 0', () => {
    expect(() => assertStockNotNegative(0, 'Filtro')).not.toThrow();
    expect(() => assertStockNotNegative(5, 'Filtro')).not.toThrow();
  });

  it('lanca ConflictException quando o saldo resultante seria negativo', () => {
    expect(() => assertStockNotNegative(-1, 'Filtro de óleo')).toThrow(ConflictException);
  });
});
