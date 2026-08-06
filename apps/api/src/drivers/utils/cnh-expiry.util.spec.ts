import { cnhExpiringThreshold } from './cnh-expiry.util';

describe('cnhExpiringThreshold', () => {
  it('soma os dias informados a partir da data de referencia', () => {
    const now = new Date('2026-08-06T12:00:00.000Z');
    const threshold = cnhExpiringThreshold(30, now);
    expect(threshold.toISOString()).toBe('2026-09-05T12:00:00.000Z');
  });

  it('aceita 0 dias (apenas CNHs ja vencidas ate agora)', () => {
    const now = new Date('2026-08-06T12:00:00.000Z');
    const threshold = cnhExpiringThreshold(0, now);
    expect(threshold.toISOString()).toBe(now.toISOString());
  });
});
