import { computeRouteComparison } from './route-comparison.util';

describe('route-comparison.util', () => {
  describe('computeRouteComparison', () => {
    it('calcula a diferenca entre rota original e nova rota (exemplo da Fase 26)', () => {
      const previous = { distanceMeters: 520_000, durationSeconds: 6.5 * 3600, tollCount: 4, totalTollAmount: 128 };
      const next = { distanceMeters: 545_000, durationSeconds: 6.5 * 3600 + 20 * 60, tollCount: 5, totalTollAmount: 151 };

      const result = computeRouteComparison(previous, next);

      expect(result.distanceMetersDiff).toBe(25_000);
      expect(result.durationSecondsDiff).toBe(20 * 60);
      expect(result.tollCountDiff).toBe(1);
      expect(result.totalTollAmountDiff).toBe(23);
    });

    it('diferenca negativa quando a nova rota e melhor', () => {
      const previous = { distanceMeters: 500_000, durationSeconds: 5000, tollCount: 3, totalTollAmount: 90 };
      const next = { distanceMeters: 480_000, durationSeconds: 4800, tollCount: 2, totalTollAmount: 60 };

      const result = computeRouteComparison(previous, next);

      expect(result.distanceMetersDiff).toBe(-20_000);
      expect(result.tollCountDiff).toBe(-1);
      expect(result.totalTollAmountDiff).toBe(-30);
    });

    it('diferenca de custo e null quando qualquer um dos lados nao tem custo conhecido', () => {
      const previous = { distanceMeters: 100, durationSeconds: 100, tollCount: 1, totalTollAmount: null };
      const next = { distanceMeters: 100, durationSeconds: 100, tollCount: 1, totalTollAmount: 50 };

      expect(computeRouteComparison(previous, next).totalTollAmountDiff).toBeNull();
      expect(computeRouteComparison(next, previous).totalTollAmountDiff).toBeNull();
    });
  });
});
