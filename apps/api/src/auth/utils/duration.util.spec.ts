import { addDuration, parseDurationToMs } from './duration.util';

describe('duration.util', () => {
  it.each([
    ['15m', 15 * 60 * 1000],
    ['1h', 60 * 60 * 1000],
    ['7d', 7 * 24 * 60 * 60 * 1000],
    ['30s', 30 * 1000],
  ])('parseDurationToMs("%s") === %i', (input, expected) => {
    expect(parseDurationToMs(input)).toBe(expected);
  });

  it('rejeita formato invalido', () => {
    expect(() => parseDurationToMs('15')).toThrow();
    expect(() => parseDurationToMs('abc')).toThrow();
  });

  it('addDuration soma a duracao a partir de uma data de referencia', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const result = addDuration('1h', from);
    expect(result.getTime() - from.getTime()).toBe(60 * 60 * 1000);
  });
});
