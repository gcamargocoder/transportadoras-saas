import { computeTripOccurrenceStatus, isCriticalOpenOccurrence } from './trip-occurrence.mapper';

describe('computeTripOccurrenceStatus', () => {
  it('OPEN quando nao ha resolvedAt nem cancelledAt', () => {
    expect(computeTripOccurrenceStatus({ resolvedAt: null, cancelledAt: null })).toBe('OPEN');
  });

  it('RESOLVED quando ha resolvedAt e nenhum cancelledAt', () => {
    expect(computeTripOccurrenceStatus({ resolvedAt: new Date(), cancelledAt: null })).toBe('RESOLVED');
  });

  it('CANCELLED quando ha cancelledAt, mesmo sem resolvedAt', () => {
    expect(computeTripOccurrenceStatus({ resolvedAt: null, cancelledAt: new Date() })).toBe('CANCELLED');
  });

  it('CANCELLED tem prioridade sobre RESOLVED (ocorrencia resolvida e depois cancelada)', () => {
    expect(computeTripOccurrenceStatus({ resolvedAt: new Date(), cancelledAt: new Date() })).toBe('CANCELLED');
  });
});

// Fase 68 -- regra de "alerta operacional critico" (dashboard de
// ocorrencias, FleetAlert, VehicleOverview).
describe('isCriticalOpenOccurrence', () => {
  it('true quando severity=CRITICAL e status OPEN (sem resolvedAt/cancelledAt)', () => {
    expect(isCriticalOpenOccurrence({ severity: 'CRITICAL', resolvedAt: null, cancelledAt: null })).toBe(true);
  });

  it('false quando severity=INFO, mesmo em aberto', () => {
    expect(isCriticalOpenOccurrence({ severity: 'INFO', resolvedAt: null, cancelledAt: null })).toBe(false);
  });

  it('false quando severity=WARNING, mesmo em aberto', () => {
    expect(isCriticalOpenOccurrence({ severity: 'WARNING', resolvedAt: null, cancelledAt: null })).toBe(false);
  });

  it('exclui do alerta apos resolvedAt preenchido (mesmo CRITICAL)', () => {
    expect(isCriticalOpenOccurrence({ severity: 'CRITICAL', resolvedAt: new Date(), cancelledAt: null })).toBe(false);
  });

  it('exclui do alerta apos cancelledAt preenchido (mesmo CRITICAL)', () => {
    expect(isCriticalOpenOccurrence({ severity: 'CRITICAL', resolvedAt: null, cancelledAt: new Date() })).toBe(false);
  });

  it('exclui quando resolvida e depois cancelada', () => {
    expect(isCriticalOpenOccurrence({ severity: 'CRITICAL', resolvedAt: new Date(), cancelledAt: new Date() })).toBe(false);
  });
});
