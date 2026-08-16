import { BadRequestException } from '@nestjs/common';
import { computeDurationMinutesOrThrow } from './trip-stop-duration.util';

describe('computeDurationMinutesOrThrow', () => {
  it('calcula a duracao em minutos, arredondada', () => {
    const startedAt = new Date('2026-09-01T10:00:00.000Z');
    const endedAt = new Date('2026-09-01T10:25:00.000Z');
    expect(computeDurationMinutesOrThrow(startedAt, endedAt)).toBe(25);
  });

  it('arredonda fracoes de minuto (30s conta como 1 minuto por Math.round)', () => {
    const startedAt = new Date('2026-09-01T10:00:00.000Z');
    const endedAt = new Date('2026-09-01T10:00:30.000Z');
    expect(computeDurationMinutesOrThrow(startedAt, endedAt)).toBe(1);
  });

  it('retorna 0 quando inicio e fim sao o mesmo instante', () => {
    const at = new Date('2026-09-01T10:00:00.000Z');
    expect(computeDurationMinutesOrThrow(at, at)).toBe(0);
  });

  it('nunca retorna duracao negativa -- lanca BadRequestException quando endedAt < startedAt', () => {
    const startedAt = new Date('2026-09-01T10:00:00.000Z');
    const endedAt = new Date('2026-09-01T09:59:00.000Z');
    expect(() => computeDurationMinutesOrThrow(startedAt, endedAt)).toThrow(BadRequestException);
  });
});
