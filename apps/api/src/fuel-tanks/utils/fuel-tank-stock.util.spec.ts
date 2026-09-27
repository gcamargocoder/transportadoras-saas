import { ConflictException } from '@nestjs/common';
import { FuelTankMovementType, FuelTankStatus } from '@prisma/client';
import {
  applyTankMovementDelta,
  assertTankActiveForMovement,
  assertTankBalanceNotNegative,
  assertTankBalanceWithinCapacity,
  computeDivergencePercent,
  computeIsLowStock,
  computeOccupancyPercent,
} from './fuel-tank-stock.util';

describe('computeIsLowStock', () => {
  it('retorna false quando minStockLiters nao informado', () => {
    expect(computeIsLowStock(0, null)).toBe(false);
    expect(computeIsLowStock(1000, null)).toBe(false);
  });

  it('retorna true quando currentStockLiters <= minStockLiters', () => {
    expect(computeIsLowStock(500, 500)).toBe(true);
    expect(computeIsLowStock(200, 500)).toBe(true);
  });

  it('retorna false quando currentStockLiters > minStockLiters', () => {
    expect(computeIsLowStock(600, 500)).toBe(false);
  });
});

describe('computeOccupancyPercent', () => {
  it('calcula o percentual arredondado a 1 casa decimal', () => {
    expect(computeOccupancyPercent(8000, 15000)).toBeCloseTo(53.3, 5);
    expect(computeOccupancyPercent(0, 500)).toBe(0);
    expect(computeOccupancyPercent(500, 500)).toBe(100);
  });

  it('retorna 0 quando capacityLiters <= 0 (guarda contra divisao por zero)', () => {
    expect(computeOccupancyPercent(100, 0)).toBe(0);
  });
});

describe('applyTankMovementDelta', () => {
  it('INITIAL_BALANCE e RECEIPT somam ao saldo', () => {
    expect(applyTankMovementDelta(0, FuelTankMovementType.INITIAL_BALANCE, 8000)).toBe(8000);
    expect(applyTankMovementDelta(8000, FuelTankMovementType.RECEIPT, 2000)).toBe(10000);
  });

  it('INTERNAL_FUELING subtrai do saldo', () => {
    expect(applyTankMovementDelta(500, FuelTankMovementType.INTERNAL_FUELING, 300)).toBe(200);
  });

  it('ADJUSTMENT aplica o delta com sinal diretamente', () => {
    expect(applyTankMovementDelta(500, FuelTankMovementType.ADJUSTMENT, -50)).toBe(450);
    expect(applyTankMovementDelta(500, FuelTankMovementType.ADJUSTMENT, 50)).toBe(550);
  });
});

describe('assertTankBalanceNotNegative', () => {
  it('nao lanca quando o saldo resultante e >= 0', () => {
    expect(() => assertTankBalanceNotNegative(0, 'Tanque A')).not.toThrow();
    expect(() => assertTankBalanceNotNegative(1, 'Tanque A')).not.toThrow();
  });

  it('lanca ConflictException quando o saldo resultante seria negativo', () => {
    expect(() => assertTankBalanceNotNegative(-1, 'Tanque A')).toThrow(ConflictException);
  });
});

describe('assertTankBalanceWithinCapacity', () => {
  it('nao lanca quando o saldo resultante cabe na capacidade', () => {
    expect(() => assertTankBalanceWithinCapacity(500, 500, 'Tanque A')).not.toThrow();
    expect(() => assertTankBalanceWithinCapacity(499, 500, 'Tanque A')).not.toThrow();
  });

  it('lanca ConflictException quando o saldo resultante excede a capacidade', () => {
    expect(() => assertTankBalanceWithinCapacity(501, 500, 'Tanque A')).toThrow(ConflictException);
  });
});

describe('assertTankActiveForMovement', () => {
  it('nao lanca quando o tanque esta ACTIVE', () => {
    expect(() => assertTankActiveForMovement(FuelTankStatus.ACTIVE, 'Tanque A')).not.toThrow();
  });

  it('lanca ConflictException quando o tanque esta INACTIVE', () => {
    expect(() => assertTankActiveForMovement(FuelTankStatus.INACTIVE, 'Tanque A')).toThrow(ConflictException);
  });
});

describe('computeDivergencePercent (Fase 4)', () => {
  it('divergencia negativa (fisico < teorico)', () => {
    expect(computeDivergencePercent(7550, -70)).toBeCloseTo(-0.9, 5);
  });

  it('divergencia positiva (fisico > teorico)', () => {
    expect(computeDivergencePercent(7550, 70)).toBeCloseTo(0.9, 5);
  });

  it('divergencia zero', () => {
    expect(computeDivergencePercent(7550, 0)).toBe(0);
  });

  it('retorna null quando o teorico e 0 (divisao indefinida, nunca inventada)', () => {
    expect(computeDivergencePercent(0, 50)).toBeNull();
  });
});
