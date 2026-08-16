import { getStopDurationThreshold, resolveStopDurationThresholds } from './stop-duration-thresholds.util';

describe('resolveStopDurationThresholds', () => {
  it('usa os padroes quando preferences e null/undefined', () => {
    expect(resolveStopDurationThresholds(null)).toMatchObject({ FUEL: 30, MAINTENANCE: 180 });
    expect(resolveStopDurationThresholds(undefined)).toMatchObject({ FUEL: 30 });
  });

  it('tipos sem exemplo de negocio conhecido ficam sem limite por padrao (nunca inventado)', () => {
    const thresholds = resolveStopDurationThresholds(null);
    expect(thresholds.OTHER).toBeUndefined();
    expect(thresholds.WAITING_LOADING).toBeUndefined();
  });

  it('override do tenant vence sobre o padrao', () => {
    const thresholds = resolveStopDurationThresholds({ stopDurationThresholdsMinutes: { FUEL: 45 } });
    expect(thresholds.FUEL).toBe(45);
    expect(thresholds.MAINTENANCE).toBe(180); // nao sobrescrito, mantem o padrao
  });

  it('permite configurar um tipo sem padrao', () => {
    const thresholds = resolveStopDurationThresholds({ stopDurationThresholdsMinutes: { OTHER: 15 } });
    expect(thresholds.OTHER).toBe(15);
  });

  it('ignora chaves que nao sao TripStopType valido', () => {
    const thresholds = resolveStopDurationThresholds({ stopDurationThresholdsMinutes: { NAO_EXISTE: 10 } });
    expect((thresholds as Record<string, unknown>).NAO_EXISTE).toBeUndefined();
  });

  it('ignora valores nao numericos, negativos, zero ou nao finitos', () => {
    const thresholds = resolveStopDurationThresholds({
      stopDurationThresholdsMinutes: { FUEL: 'trinta', LOADING: -10, UNLOADING: 0, MAINTENANCE: Infinity },
    });
    expect(thresholds.FUEL).toBe(30); // mantem o padrao, valor invalido ignorado
    expect(thresholds.LOADING).toBe(120);
    expect(thresholds.UNLOADING).toBe(120);
    expect(thresholds.MAINTENANCE).toBe(180);
  });

  it('nunca lanca excecao com um JSON completamente malformado', () => {
    expect(() => resolveStopDurationThresholds('string qualquer')).not.toThrow();
    expect(() => resolveStopDurationThresholds(42)).not.toThrow();
    expect(() => resolveStopDurationThresholds({ stopDurationThresholdsMinutes: 'nao e objeto' })).not.toThrow();
    expect(() => resolveStopDurationThresholds({ stopDurationThresholdsMinutes: ['array'] })).not.toThrow();
  });
});

describe('getStopDurationThreshold', () => {
  it('retorna o limite configurado', () => {
    const thresholds = resolveStopDurationThresholds(null);
    expect(getStopDurationThreshold(thresholds, 'FUEL')).toBe(30);
  });

  it('retorna null (nunca um numero inventado) quando o tipo nao tem limite configurado', () => {
    const thresholds = resolveStopDurationThresholds(null);
    expect(getStopDurationThreshold(thresholds, 'OTHER')).toBeNull();
  });
});
