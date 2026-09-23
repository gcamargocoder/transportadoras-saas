import { buildKpiBuckets, isValidTimeZone, resolveGranularity, zonedMidnight } from './kpi-buckets.util';

const SP = 'America/Sao_Paulo'; // UTC-3, sem horario de verao desde 2019
const later = new Date('2030-01-01T00:00:00Z');

describe('kpi-buckets.util', () => {
  it('meia-noite no fuso do tenant', () => {
    expect(zonedMidnight({ year: 2026, month: 9, day: 1 }, SP).toISOString()).toBe('2026-09-01T03:00:00.000Z');
    expect(zonedMidnight({ year: 2026, month: 9, day: 1 }, 'UTC').toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('respeita horario de verao (America/New_York)', () => {
    expect(zonedMidnight({ year: 2026, month: 1, day: 15 }, 'America/New_York').toISOString()).toBe('2026-01-15T05:00:00.000Z');
    expect(zonedMidnight({ year: 2026, month: 7, day: 15 }, 'America/New_York').toISOString()).toBe('2026-07-15T04:00:00.000Z');
  });

  it('baldes mensais contiguos, sem sobreposicao nem lacuna, no calendario local', () => {
    const period = { start: new Date('2026-01-01T03:00:00Z'), end: new Date('2026-04-01T02:59:59.999Z') };
    const buckets = buildKpiBuckets(period, 'month', SP, later);
    expect(buckets.map((b) => b.label)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(buckets[0]!.start.toISOString()).toBe('2026-01-01T03:00:00.000Z');
    expect(buckets[0]!.end.toISOString()).toBe('2026-02-01T02:59:59.999Z');
    for (let i = 1; i < buckets.length; i += 1) {
      expect(buckets[i]!.start.getTime()).toBe(buckets[i - 1]!.end.getTime() + 1);
    }
    expect(buckets.every((b) => !b.partial)).toBe(true);
  });

  it('periodo que comeca/termina no meio do mes gera baldes parciais recortados', () => {
    const period = { start: new Date('2026-01-15T03:00:00Z'), end: new Date('2026-02-10T02:59:59.999Z') };
    const buckets = buildKpiBuckets(period, 'month', SP, later);
    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({ label: '2026-01', partial: true });
    expect(buckets[0]!.start.toISOString()).toBe('2026-01-15T03:00:00.000Z');
    expect(buckets[1]!.end.toISOString()).toBe('2026-02-10T02:59:59.999Z');
    expect(buckets[1]!.partial).toBe(true);
  });

  it('balde que ainda nao terminou (depois de agora) e parcial', () => {
    const period = { start: new Date('2026-09-01T03:00:00Z'), end: new Date('2026-10-01T02:59:59.999Z') };
    const [bucket] = buildKpiBuckets(period, 'month', SP, new Date('2026-09-22T12:00:00Z'));
    expect(bucket!.partial).toBe(true);
  });

  it('semanas ISO comecam na segunda-feira', () => {
    // 2026-09-23 e quarta-feira
    const period = { start: new Date('2026-09-23T03:00:00Z'), end: new Date('2026-10-05T02:59:59.999Z') };
    const buckets = buildKpiBuckets(period, 'week', SP, later);
    expect(buckets.map((b) => b.label)).toEqual(['2026-09-21', '2026-09-28']);
    expect(buckets[0]!.partial).toBe(true);
  });

  it('diario: um balde por dia local', () => {
    const period = { start: new Date('2026-09-20T03:00:00Z'), end: new Date('2026-09-23T02:59:59.999Z') };
    expect(buildKpiBuckets(period, 'day', SP, later).map((b) => b.label)).toEqual(['2026-09-20', '2026-09-21', '2026-09-22']);
  });

  it('granularidade automatica por tamanho do periodo', () => {
    const at = (days: number) => ({ start: new Date(0), end: new Date(days * 86_400_000) });
    expect(resolveGranularity(at(30))).toBe('day');
    expect(resolveGranularity(at(90))).toBe('week');
    expect(resolveGranularity(at(365))).toBe('month');
  });

  it('fuso invalido e detectado', () => {
    expect(isValidTimeZone(SP)).toBe(true);
    expect(isValidTimeZone('Marte/Olympus')).toBe(false);
  });
});
