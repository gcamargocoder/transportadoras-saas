import { computeIdlePeriodDurationMinutes } from './idle-period-duration.util';

describe('computeIdlePeriodDurationMinutes (Fase B)', () => {
  it('calcula a duracao em minutos, arredondada (reutiliza computeDurationMinutesOrThrow)', () => {
    expect(
      computeIdlePeriodDurationMinutes(new Date('2026-09-01T10:00:00.000Z'), new Date('2026-09-01T12:30:00.000Z')),
    ).toBe(150);
  });

  it('duracao 0 quando inicio e fim sao o mesmo instante', () => {
    const at = new Date('2026-09-01T10:00:00.000Z');
    expect(computeIdlePeriodDurationMinutes(at, at)).toBe(0);
  });

  it('NUNCA negativa: fim anterior ao inicio e recortado para o inicio -> 0 (nunca lanca)', () => {
    expect(
      computeIdlePeriodDurationMinutes(new Date('2026-09-01T10:00:00.000Z'), new Date('2026-09-01T09:00:00.000Z')),
    ).toBe(0);
    expect(() =>
      computeIdlePeriodDurationMinutes(new Date('2026-09-01T10:00:00.000Z'), new Date('2026-09-01T08:00:00.000Z')),
    ).not.toThrow();
  });

  it('arredonda fracoes de minuto (Math.round, mesma convencao da util de origem)', () => {
    expect(
      computeIdlePeriodDurationMinutes(new Date('2026-09-01T10:00:00.000Z'), new Date('2026-09-01T10:00:30.000Z')),
    ).toBe(1);
  });
});
