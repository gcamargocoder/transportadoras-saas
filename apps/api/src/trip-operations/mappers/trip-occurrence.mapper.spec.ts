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

  // Fase 101
  it('OPEN quando inProgressAt e omitido (chamador antigo, equivalente a nunca ter sido marcada em andamento)', () => {
    expect(computeTripOccurrenceStatus({ resolvedAt: null, cancelledAt: null })).toBe('OPEN');
  });

  it('IN_PROGRESS quando inProgressAt preenchido e resolvedAt/cancelledAt nulos', () => {
    expect(computeTripOccurrenceStatus({ resolvedAt: null, cancelledAt: null, inProgressAt: new Date() })).toBe('IN_PROGRESS');
  });

  it('RESOLVED tem prioridade sobre IN_PROGRESS', () => {
    expect(computeTripOccurrenceStatus({ resolvedAt: new Date(), cancelledAt: null, inProgressAt: new Date() })).toBe('RESOLVED');
  });

  it('CANCELLED tem prioridade sobre IN_PROGRESS', () => {
    expect(computeTripOccurrenceStatus({ resolvedAt: null, cancelledAt: new Date(), inProgressAt: new Date() })).toBe('CANCELLED');
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

  // Fase 101 -- isCriticalOpenOccurrence deliberadamente NAO recebe
  // inProgressAt: uma ocorrencia critica em IN_PROGRESS continua sendo um
  // alerta em aberto (so sai quando de fato resolvida/cancelada), mesmo
  // criterio das consultas reais (que tambem nunca checam inProgressAt).
  it('continua true mesmo apos ser marcada como em andamento (so resolvedAt/cancelledAt tiram do alerta)', () => {
    expect(isCriticalOpenOccurrence({ severity: 'CRITICAL', resolvedAt: null, cancelledAt: null })).toBe(true);
  });
});
