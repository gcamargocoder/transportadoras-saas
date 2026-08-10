import { TripStatus } from '@prisma/client';
import {
  computeLocationFreshness,
  computeMovementStatus,
  computeOperationalStatus,
} from './operational-status.util';

describe('computeMovementStatus', () => {
  it('retorna UNKNOWN quando nao ha leitura de velocidade', () => {
    expect(computeMovementStatus(null)).toBe('UNKNOWN');
  });

  it('retorna MOVING acima do limiar', () => {
    expect(computeMovementStatus(10)).toBe('MOVING');
  });

  it('retorna STOPPED no ou abaixo do limiar', () => {
    expect(computeMovementStatus(3)).toBe('STOPPED');
    expect(computeMovementStatus(0)).toBe('STOPPED');
  });
});

describe('computeLocationFreshness', () => {
  const now = new Date('2026-09-01T12:00:00.000Z');

  it('retorna OFFLINE quando nunca houve posicao', () => {
    expect(computeLocationFreshness(null, now, 15)).toBe('OFFLINE');
  });

  it('retorna ONLINE dentro do limiar de stale', () => {
    const lastTrackingAt = new Date('2026-09-01T11:50:00.000Z'); // 10 min
    expect(computeLocationFreshness(lastTrackingAt, now, 15)).toBe('ONLINE');
  });

  it('retorna STALE acima do limiar mas abaixo do multiplicador de offline', () => {
    const lastTrackingAt = new Date('2026-09-01T11:40:00.000Z'); // 20 min
    expect(computeLocationFreshness(lastTrackingAt, now, 15)).toBe('STALE');
  });

  it('retorna OFFLINE muito acima do limiar (4x stale)', () => {
    const lastTrackingAt = new Date('2026-09-01T10:00:00.000Z'); // 120 min
    expect(computeLocationFreshness(lastTrackingAt, now, 15)).toBe('OFFLINE');
  });
});

describe('computeOperationalStatus', () => {
  const now = new Date('2026-09-01T12:00:00.000Z');
  const online = new Date('2026-09-01T11:58:00.000Z'); // 2 min atras
  const stale = new Date('2026-09-01T11:30:00.000Z'); // 30 min atras

  it('PAUSED espelha diretamente o TripStatus, independente de GPS', () => {
    expect(
      computeOperationalStatus({
        tripStatus: TripStatus.PAUSED,
        lastTrackingAt: null,
        speedKmh: null,
        hasUnresolvedDeviation: false,
        now,
        staleThresholdMinutes: 15,
      }),
    ).toBe('PAUSED');
  });

  it('COMPLETED e CANCELLED colapsam para COMPLETED', () => {
    for (const tripStatus of [TripStatus.COMPLETED, TripStatus.CANCELLED]) {
      expect(
        computeOperationalStatus({
          tripStatus,
          lastTrackingAt: online,
          speedKmh: 50,
          hasUnresolvedDeviation: false,
          now,
          staleThresholdMinutes: 15,
        }),
      ).toBe('COMPLETED');
    }
  });

  it('viagem ainda nao iniciada (PLANNED/WAITING_*) e UNKNOWN', () => {
    expect(
      computeOperationalStatus({
        tripStatus: TripStatus.PLANNED,
        lastTrackingAt: null,
        speedKmh: null,
        hasUnresolvedDeviation: false,
        now,
        staleThresholdMinutes: 15,
      }),
    ).toBe('UNKNOWN');
  });

  it('IN_PROGRESS com posicao stale vira STALE mesmo com velocidade disponivel', () => {
    expect(
      computeOperationalStatus({
        tripStatus: TripStatus.IN_PROGRESS,
        lastTrackingAt: stale,
        speedKmh: 60,
        hasUnresolvedDeviation: false,
        now,
        staleThresholdMinutes: 15,
      }),
    ).toBe('STALE');
  });

  it('IN_PROGRESS online com desvio em aberto vira OFF_ROUTE (prioridade sobre movimento)', () => {
    expect(
      computeOperationalStatus({
        tripStatus: TripStatus.IN_PROGRESS,
        lastTrackingAt: online,
        speedKmh: 60,
        hasUnresolvedDeviation: true,
        now,
        staleThresholdMinutes: 15,
      }),
    ).toBe('OFF_ROUTE');
  });

  it('IN_PROGRESS online sem desvio reflete o movimento (MOVING)', () => {
    expect(
      computeOperationalStatus({
        tripStatus: TripStatus.IN_PROGRESS,
        lastTrackingAt: online,
        speedKmh: 60,
        hasUnresolvedDeviation: false,
        now,
        staleThresholdMinutes: 15,
      }),
    ).toBe('MOVING');
  });

  it('IN_PROGRESS online sem desvio e parado reflete STOPPED', () => {
    expect(
      computeOperationalStatus({
        tripStatus: TripStatus.IN_PROGRESS,
        lastTrackingAt: online,
        speedKmh: 0,
        hasUnresolvedDeviation: false,
        now,
        staleThresholdMinutes: 15,
      }),
    ).toBe('STOPPED');
  });

  it('IN_PROGRESS online sem leitura de velocidade e UNKNOWN (nunca falsa precisao)', () => {
    expect(
      computeOperationalStatus({
        tripStatus: TripStatus.IN_PROGRESS,
        lastTrackingAt: online,
        speedKmh: null,
        hasUnresolvedDeviation: false,
        now,
        staleThresholdMinutes: 15,
      }),
    ).toBe('UNKNOWN');
  });
});
