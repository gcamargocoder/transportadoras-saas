import { computeTripStopStatus } from './trip-stop.mapper';

describe('computeTripStopStatus', () => {
  it('OPEN quando nao ha endedAt nem cancelledAt', () => {
    expect(computeTripStopStatus({ endedAt: null, cancelledAt: null })).toBe('OPEN');
  });

  it('COMPLETED quando ha endedAt e nenhum cancelledAt', () => {
    expect(computeTripStopStatus({ endedAt: new Date(), cancelledAt: null })).toBe('COMPLETED');
  });

  it('CANCELLED quando ha cancelledAt, mesmo sem endedAt (cancelamento de parada aberta)', () => {
    expect(computeTripStopStatus({ endedAt: null, cancelledAt: new Date() })).toBe('CANCELLED');
  });

  it('CANCELLED tem prioridade sobre COMPLETED (parada fechada e depois cancelada)', () => {
    expect(computeTripStopStatus({ endedAt: new Date(), cancelledAt: new Date() })).toBe('CANCELLED');
  });
});
