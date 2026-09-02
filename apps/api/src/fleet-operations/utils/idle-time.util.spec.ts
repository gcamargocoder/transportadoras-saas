import { TripStatus } from '@prisma/client';
import {
  computeIdleSegments,
  computeMaintenanceOverlapMinutes,
  IdleTripBoundary,
  mergeIntervals,
  resolveIdleAlertThresholdMinutes,
} from './idle-time.util';

const NOW = new Date('2026-09-10T12:00:00.000Z');

function trip(overrides: Partial<IdleTripBoundary> & { tripId: string }): IdleTripBoundary {
  return {
    status: TripStatus.COMPLETED,
    actualDeparture: null,
    actualArrival: null,
    destinationLabel: null,
    ...overrides,
  };
}

describe('computeIdleSegments', () => {
  it('uma viagem concluida sem sucessora -> veiculo parado ATUALMENTE (isCurrent, idleEnd nulo, ate NOW)', () => {
    const segments = computeIdleSegments(
      [
        trip({
          tripId: 't1',
          actualDeparture: new Date('2026-09-08T06:00:00.000Z'),
          actualArrival: new Date('2026-09-09T12:00:00.000Z'),
          destinationLabel: 'CD Guarulhos/SP',
        }),
      ],
      NOW,
    );

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      previousTripId: 't1',
      nextTripId: null,
      idleEnd: null,
      isCurrent: true,
      previousDestinationLabel: 'CD Guarulhos/SP',
    });
    // 2026-09-09T12:00 -> 2026-09-10T12:00 = 24h = 1440 min
    expect(segments[0]!.totalMinutes).toBe(1440);
    expect(segments[0]!.idleStart).toEqual(new Date('2026-09-09T12:00:00.000Z'));
  });

  it('duas viagens -> um gap entre a chegada da 1a e a partida da 2a', () => {
    const segments = computeIdleSegments(
      [
        trip({
          tripId: 't1',
          actualDeparture: new Date('2026-09-01T06:00:00.000Z'),
          actualArrival: new Date('2026-09-02T00:00:00.000Z'),
        }),
        trip({
          tripId: 't2',
          actualDeparture: new Date('2026-09-02T06:00:00.000Z'),
          actualArrival: new Date('2026-09-03T00:00:00.000Z'),
        }),
      ],
      NOW,
    );

    // gap fechado (t1.arrival -> t2.departure) + gap corrente (t2.arrival -> NOW)
    expect(segments).toHaveLength(2);
    const closed = segments.find((s) => !s.isCurrent)!;
    expect(closed).toMatchObject({ previousTripId: 't1', nextTripId: 't2', isCurrent: false });
    // 2026-09-02T00:00 -> 2026-09-02T06:00 = 360 min
    expect(closed.totalMinutes).toBe(360);
    expect(closed.idleEnd).toEqual(new Date('2026-09-02T06:00:00.000Z'));
  });

  it('tres ou mais viagens -> um gap fechado entre cada par consecutivo + o corrente', () => {
    const segments = computeIdleSegments(
      [
        trip({ tripId: 't1', actualDeparture: new Date('2026-09-01T00:00:00.000Z'), actualArrival: new Date('2026-09-01T10:00:00.000Z') }),
        trip({ tripId: 't2', actualDeparture: new Date('2026-09-01T12:00:00.000Z'), actualArrival: new Date('2026-09-01T20:00:00.000Z') }),
        trip({ tripId: 't3', actualDeparture: new Date('2026-09-02T02:00:00.000Z'), actualArrival: new Date('2026-09-02T09:00:00.000Z') }),
      ],
      NOW,
    );

    const closed = segments.filter((s) => !s.isCurrent);
    expect(closed).toHaveLength(2);
    expect(closed.map((s) => [s.previousTripId, s.nextTripId])).toEqual([
      ['t1', 't2'],
      ['t2', 't3'],
    ]);
    expect(closed[0]!.totalMinutes).toBe(120); // 10:00 -> 12:00
    expect(closed[1]!.totalMinutes).toBe(360); // 20:00 -> 02:00 (+1d)
    expect(segments.some((s) => s.isCurrent && s.previousTripId === 't3')).toBe(true);
  });

  it('viagens sem os timestamps necessarios sao ignoradas (nunca inventadas)', () => {
    const segments = computeIdleSegments(
      [
        trip({ tripId: 't1', actualDeparture: new Date('2026-09-01T00:00:00.000Z'), actualArrival: new Date('2026-09-01T10:00:00.000Z') }),
        trip({ tripId: 't-no-ts', actualDeparture: null, actualArrival: null }),
        trip({ tripId: 't2', actualDeparture: new Date('2026-09-01T15:00:00.000Z'), actualArrival: new Date('2026-09-01T20:00:00.000Z') }),
      ],
      NOW,
    );

    const closed = segments.filter((s) => !s.isCurrent);
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ previousTripId: 't1', nextTripId: 't2' });
    expect(closed[0]!.totalMinutes).toBe(300); // 10:00 -> 15:00
  });

  it('gap de duracao zero e mantido explicitamente (totalMinutes = 0, nunca omitido nem negativo)', () => {
    const at = new Date('2026-09-02T10:00:00.000Z');
    const segments = computeIdleSegments(
      [
        trip({ tripId: 't1', actualDeparture: new Date('2026-09-01T00:00:00.000Z'), actualArrival: at }),
        trip({ tripId: 't2', actualDeparture: at, actualArrival: new Date('2026-09-03T00:00:00.000Z') }),
      ],
      NOW,
    );

    const closed = segments.find((s) => !s.isCurrent)!;
    expect(closed.totalMinutes).toBe(0);
    expect(closed.idleStart).toEqual(closed.idleEnd);
  });

  it('timestamps invalidos (Invalid Date) sao tratados como ausentes -- sem crash, sem gap', () => {
    const segments = computeIdleSegments(
      [
        trip({ tripId: 't1', actualDeparture: new Date('nao-e-data'), actualArrival: new Date('nao-e-data') }),
        trip({ tripId: 't2', actualDeparture: new Date('2026-09-01T00:00:00.000Z'), actualArrival: new Date('2026-09-01T05:00:00.000Z') }),
      ],
      NOW,
    );
    // t1 e ignorada; sobra so o gap corrente de t2.
    expect(segments.filter((s) => !s.isCurrent)).toHaveLength(0);
    expect(segments.filter((s) => s.isCurrent)).toHaveLength(1);
  });

  it('gap invertido (proxima partiu ANTES da anterior chegar) e ignorado -- nunca duracao negativa', () => {
    const segments = computeIdleSegments(
      [
        trip({ tripId: 't1', actualDeparture: new Date('2026-09-01T00:00:00.000Z'), actualArrival: new Date('2026-09-05T00:00:00.000Z') }),
        trip({ tripId: 't2', actualDeparture: new Date('2026-09-03T00:00:00.000Z'), actualArrival: new Date('2026-09-04T00:00:00.000Z') }),
      ],
      NOW,
    );
    expect(segments.every((s) => s.totalMinutes >= 0)).toBe(true);
    // Nenhum gap fechado valido: t2 partiu antes de t1 chegar.
    expect(segments.filter((s) => !s.isCurrent)).toHaveLength(0);
  });

  it('veiculo ATUALMENTE em viagem (IN_PROGRESS) nunca produz periodo corrente', () => {
    const segments = computeIdleSegments(
      [
        trip({ tripId: 't1', status: TripStatus.COMPLETED, actualDeparture: new Date('2026-09-01T00:00:00.000Z'), actualArrival: new Date('2026-09-02T00:00:00.000Z') }),
        trip({ tripId: 't2', status: TripStatus.IN_PROGRESS, actualDeparture: new Date('2026-09-02T08:00:00.000Z'), actualArrival: null }),
      ],
      NOW,
    );
    expect(segments.some((s) => s.isCurrent)).toBe(false);
    const closed = segments.filter((s) => !s.isCurrent);
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ previousTripId: 't1', nextTripId: 't2' });
    expect(closed[0]!.totalMinutes).toBe(480); // 00:00 -> 08:00
  });

  it('veiculo PAUSED (partiu, ainda nao chegou) tambem fecha a ociosidade anterior e nao abre corrente', () => {
    const segments = computeIdleSegments(
      [
        trip({ tripId: 't1', status: TripStatus.COMPLETED, actualDeparture: new Date('2026-09-01T00:00:00.000Z'), actualArrival: new Date('2026-09-02T00:00:00.000Z') }),
        trip({ tripId: 't2', status: TripStatus.PAUSED, actualDeparture: new Date('2026-09-02T04:00:00.000Z'), actualArrival: null }),
      ],
      NOW,
    );
    expect(segments.some((s) => s.isCurrent)).toBe(false);
    expect(segments.filter((s) => !s.isCurrent)[0]!.totalMinutes).toBe(240);
  });

  it('veiculo sem NENHUMA viagem anterior utilizavel -> nenhum segmento', () => {
    expect(computeIdleSegments([], NOW)).toEqual([]);
    expect(
      computeIdleSegments(
        [trip({ tripId: 't1', status: TripStatus.IN_PROGRESS, actualDeparture: new Date('2026-09-09T00:00:00.000Z'), actualArrival: null })],
        NOW,
      ),
    ).toEqual([]);
  });
});

describe('computeMaintenanceOverlapMinutes', () => {
  const gapStart = new Date('2026-09-02T00:00:00.000Z');
  const gapEnd = new Date('2026-09-02T10:00:00.000Z'); // 600 min

  it('manutencao cobrindo PARTE do gap -> minutos parciais, nunca acima do total', () => {
    const minutes = computeMaintenanceOverlapMinutes(gapStart, gapEnd, [
      { start: new Date('2026-09-02T02:00:00.000Z'), end: new Date('2026-09-02T05:00:00.000Z') },
    ]);
    expect(minutes).toBe(180);
  });

  it('manutencao cobrindo TODO o gap (e transbordando) -> exatamente a duracao do gap', () => {
    const minutes = computeMaintenanceOverlapMinutes(gapStart, gapEnd, [
      { start: new Date('2026-09-01T00:00:00.000Z'), end: new Date('2026-09-03T00:00:00.000Z') },
    ]);
    expect(minutes).toBe(600);
  });

  it('OS ainda em aberto (end nulo) e recortada ate o fim do gap, nunca alem', () => {
    const minutes = computeMaintenanceOverlapMinutes(gapStart, gapEnd, [
      { start: new Date('2026-09-02T06:00:00.000Z'), end: null },
    ]);
    expect(minutes).toBe(240); // 06:00 -> 10:00
  });

  it('multiplas manutencoes que se sobrepoem contam UMA vez (sem duplicar minutos)', () => {
    const minutes = computeMaintenanceOverlapMinutes(gapStart, gapEnd, [
      { start: new Date('2026-09-02T01:00:00.000Z'), end: new Date('2026-09-02T04:00:00.000Z') },
      { start: new Date('2026-09-02T03:00:00.000Z'), end: new Date('2026-09-02T06:00:00.000Z') },
    ]);
    // uniao [01:00, 06:00] = 300 min (nao 180 + 180 = 360)
    expect(minutes).toBe(300);
  });

  it('multiplas manutencoes disjuntas somam separadamente', () => {
    const minutes = computeMaintenanceOverlapMinutes(gapStart, gapEnd, [
      { start: new Date('2026-09-02T01:00:00.000Z'), end: new Date('2026-09-02T02:00:00.000Z') },
      { start: new Date('2026-09-02T07:00:00.000Z'), end: new Date('2026-09-02T09:00:00.000Z') },
    ]);
    expect(minutes).toBe(180); // 60 + 120
  });

  it('manutencao fora do gap -> 0', () => {
    expect(
      computeMaintenanceOverlapMinutes(gapStart, gapEnd, [
        { start: new Date('2026-08-01T00:00:00.000Z'), end: new Date('2026-08-01T05:00:00.000Z') },
      ]),
    ).toBe(0);
  });

  it('range invertido/degenerado -> 0', () => {
    expect(computeMaintenanceOverlapMinutes(gapEnd, gapStart, [{ start: gapStart, end: gapEnd }])).toBe(0);
    expect(computeMaintenanceOverlapMinutes(gapStart, gapStart, [{ start: gapStart, end: gapEnd }])).toBe(0);
  });
});

describe('mergeIntervals', () => {
  it('une intervalos sobrepostos e adjacentes, descarta invalidos', () => {
    const merged = mergeIntervals([
      { start: new Date('2026-09-01T00:00:00.000Z'), end: new Date('2026-09-01T02:00:00.000Z') },
      { start: new Date('2026-09-01T02:00:00.000Z'), end: new Date('2026-09-01T03:00:00.000Z') },
      { start: new Date('2026-09-01T05:00:00.000Z'), end: new Date('2026-09-01T04:00:00.000Z') }, // invertido -> descartado
      { start: new Date('2026-09-01T06:00:00.000Z'), end: new Date('2026-09-01T07:00:00.000Z') },
    ]);
    expect(merged).toEqual([
      { start: new Date('2026-09-01T00:00:00.000Z'), end: new Date('2026-09-01T03:00:00.000Z') },
      { start: new Date('2026-09-01T06:00:00.000Z'), end: new Date('2026-09-01T07:00:00.000Z') },
    ]);
  });
});

describe('resolveIdleAlertThresholdMinutes', () => {
  it('null/undefined/nao-objeto -> null (sem alerta configurado)', () => {
    expect(resolveIdleAlertThresholdMinutes(null)).toBeNull();
    expect(resolveIdleAlertThresholdMinutes(undefined)).toBeNull();
    expect(resolveIdleAlertThresholdMinutes('x')).toBeNull();
    expect(resolveIdleAlertThresholdMinutes([1, 2])).toBeNull();
  });

  it('chave ausente -> null', () => {
    expect(resolveIdleAlertThresholdMinutes({ outraCoisa: 10 })).toBeNull();
  });

  it('valor invalido (nao numero, <= 0, NaN, Infinity) -> null (nunca um numero magico)', () => {
    expect(resolveIdleAlertThresholdMinutes({ idleAlertThresholdMinutes: '60' })).toBeNull();
    expect(resolveIdleAlertThresholdMinutes({ idleAlertThresholdMinutes: 0 })).toBeNull();
    expect(resolveIdleAlertThresholdMinutes({ idleAlertThresholdMinutes: -5 })).toBeNull();
    expect(resolveIdleAlertThresholdMinutes({ idleAlertThresholdMinutes: Number.NaN })).toBeNull();
    expect(resolveIdleAlertThresholdMinutes({ idleAlertThresholdMinutes: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it('valor positivo finito -> o proprio numero', () => {
    expect(resolveIdleAlertThresholdMinutes({ idleAlertThresholdMinutes: 720 })).toBe(720);
    expect(resolveIdleAlertThresholdMinutes({ idleAlertThresholdMinutes: 1.5 })).toBe(1.5);
  });
});
