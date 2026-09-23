import {
  computeVariation,
  parsePeriodEnd,
  parsePeriodStart,
  resolveComparisonPeriod,
  safeRatio,
} from './kpi-period.util';

describe('kpi-period.util', () => {
  describe('parsePeriodStart/parsePeriodEnd', () => {
    it('data sem hora: inicio 00:00:00.000Z e fim 23:59:59.999Z (dia inteiro incluso)', () => {
      expect(parsePeriodStart('2026-01-01').toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(parsePeriodEnd('2026-01-31').toISOString()).toBe('2026-01-31T23:59:59.999Z');
    });

    it('data com hora explicita e respeitada', () => {
      expect(parsePeriodEnd('2026-01-31T12:00:00.000Z').toISOString()).toBe('2026-01-31T12:00:00.000Z');
    });
  });

  describe('resolveComparisonPeriod', () => {
    const period = { start: parsePeriodStart('2026-02-01'), end: parsePeriodEnd('2026-02-28') };

    it('PREVIOUS_PERIOD: intervalo imediatamente anterior de mesma duracao, sem sobreposicao', () => {
      const previous = resolveComparisonPeriod('PREVIOUS_PERIOD', period);
      expect(previous).not.toBeNull();
      expect(previous!.end.getTime()).toBe(period.start.getTime() - 1);
      expect(previous!.end.getTime() - previous!.start.getTime()).toBe(period.end.getTime() - period.start.getTime());
    });

    it('PREVIOUS_YEAR: mesmas datas um ano antes', () => {
      const previous = resolveComparisonPeriod('PREVIOUS_YEAR', period);
      expect(previous!.start.toISOString()).toBe('2025-02-01T00:00:00.000Z');
      expect(previous!.end.toISOString()).toBe('2025-02-28T23:59:59.999Z');
    });

    it('CUSTOM usa as datas informadas; sem datas nao inventa periodo', () => {
      const custom = { start: new Date('2025-06-01T00:00:00Z'), end: new Date('2025-06-30T00:00:00Z') };
      expect(resolveComparisonPeriod('CUSTOM', period, custom)).toEqual(custom);
      expect(resolveComparisonPeriod('CUSTOM', period)).toBeNull();
    });

    it('NONE: sem comparacao', () => {
      expect(resolveComparisonPeriod('NONE', period)).toBeNull();
    });
  });

  describe('computeVariation', () => {
    it('variacao absoluta e percentual', () => {
      expect(computeVariation(150, 100)).toEqual({ absoluteChange: 50, percentChange: 50 });
      expect(computeVariation(50, 100)).toEqual({ absoluteChange: -50, percentChange: -50 });
    });

    it('anterior = 0: variacao absoluta existe, percentual null (nunca Infinity)', () => {
      expect(computeVariation(10, 0)).toEqual({ absoluteChange: 10, percentChange: null });
    });

    it('qualquer lado indisponivel: tudo null', () => {
      expect(computeVariation(null, 10)).toEqual({ absoluteChange: null, percentChange: null });
      expect(computeVariation(10, null)).toEqual({ absoluteChange: null, percentChange: null });
    });
  });

  describe('safeRatio', () => {
    it('divide normalmente', () => {
      expect(safeRatio(10, 4)).toBe(2.5);
    });

    it('denominador 0, negativo ou null: null (nunca NaN/Infinity)', () => {
      expect(safeRatio(10, 0)).toBeNull();
      expect(safeRatio(10, -1)).toBeNull();
      expect(safeRatio(10, null)).toBeNull();
      expect(safeRatio(0, 0)).toBeNull();
    });
  });
});
