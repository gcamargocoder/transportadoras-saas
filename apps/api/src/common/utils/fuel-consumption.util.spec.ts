import {
  computeAverageConsumptionKmL,
  computeFuelConsumptionSegments,
  computeTotalAmount,
} from './fuel-consumption.util';

describe('fuel-consumption.util', () => {
  describe('computeFuelConsumptionSegments', () => {
    it('retorna vazio quando ha menos de 2 pontos', () => {
      expect(computeFuelConsumptionSegments([])).toEqual([]);
      expect(computeFuelConsumptionSegments([{ id: 'a', odometerKm: 100, liters: 50 }])).toEqual(
        [],
      );
    });

    it('calcula distancia e consumo entre abastecimentos consecutivos, ordenando por odometro', () => {
      const segments = computeFuelConsumptionSegments([
        { id: 'b', odometerKm: 1400, liters: 60 },
        { id: 'a', odometerKm: 1000, liters: 50 },
        { id: 'c', odometerKm: 1800, liters: 50 },
      ]);

      expect(segments).toEqual([
        { id: 'b', distanceKm: 400, consumptionKmL: 400 / 60 },
        { id: 'c', distanceKm: 400, consumptionKmL: 8 },
      ]);
    });

    it('retorna consumptionKmL null quando liters do abastecimento mais recente e zero', () => {
      const segments = computeFuelConsumptionSegments([
        { id: 'a', odometerKm: 1000, liters: 50 },
        { id: 'b', odometerKm: 1200, liters: 0 },
      ]);
      expect(segments).toEqual([{ id: 'b', distanceKm: 200, consumptionKmL: null }]);
    });
  });

  describe('computeAverageConsumptionKmL', () => {
    it('retorna null quando ha menos de 2 pontos', () => {
      expect(computeAverageConsumptionKmL([])).toBeNull();
      expect(computeAverageConsumptionKmL([{ id: 'a', odometerKm: 100, liters: 50 }])).toBeNull();
    });

    it('calcula a distancia total dividida pelos litros abastecidos apos o primeiro ponto', () => {
      const average = computeAverageConsumptionKmL([
        { id: 'a', odometerKm: 1000, liters: 50 },
        { id: 'b', odometerKm: 1400, liters: 60 },
        { id: 'c', odometerKm: 1800, liters: 50 },
      ]);
      // distancia total = 1800 - 1000 = 800; litros apos o primeiro = 60 + 50 = 110
      expect(average).toBeCloseTo(800 / 110, 10);
    });

    it('retorna null quando os litros apos o primeiro ponto somam zero', () => {
      const average = computeAverageConsumptionKmL([
        { id: 'a', odometerKm: 1000, liters: 50 },
        { id: 'b', odometerKm: 1200, liters: 0 },
      ]);
      expect(average).toBeNull();
    });
  });

  describe('computeTotalAmount', () => {
    it('multiplica litros por preco e arredonda para 2 casas decimais', () => {
      expect(computeTotalAmount(45.678, 5.899)).toBeCloseTo(269.45, 2);
      expect(computeTotalAmount(10, 5)).toBe(50);
    });
  });
});
