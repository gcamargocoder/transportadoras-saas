import { evaluateMaintenancePlan } from './maintenance-plan-status.util';

const NOW = new Date('2026-09-01T00:00:00.000Z');

describe('evaluateMaintenancePlan', () => {
  it('UNKNOWN quando nao ha nenhum servico concluido ainda (sem referencia real)', () => {
    const result = evaluateMaintenancePlan({ intervalKm: 10000, intervalDays: null, alertBeforeKm: 1000, alertBeforeDays: null }, null, 50000, NOW);
    expect(result.status).toBe('UNKNOWN');
  });

  describe('criterio por quilometragem', () => {
    it('OK quando falta mais que o alertBeforeKm', () => {
      const plan = { intervalKm: 10000, intervalDays: null, alertBeforeKm: 1000, alertBeforeDays: null };
      const result = evaluateMaintenancePlan(plan, { completedAt: null, odometerKm: 100000 }, 105000, NOW);
      expect(result.status).toBe('OK');
      expect(result.dueOdometerKm).toBe(110000);
    });

    it('DUE_SOON quando falta menos que alertBeforeKm', () => {
      const plan = { intervalKm: 10000, intervalDays: null, alertBeforeKm: 1000, alertBeforeDays: null };
      const result = evaluateMaintenancePlan(plan, { completedAt: null, odometerKm: 100000 }, 109500, NOW);
      expect(result.status).toBe('DUE_SOON');
    });

    it('OVERDUE quando ja passou da quilometragem devida', () => {
      const plan = { intervalKm: 10000, intervalDays: null, alertBeforeKm: 1000, alertBeforeDays: null };
      const result = evaluateMaintenancePlan(plan, { completedAt: null, odometerKm: 100000 }, 111000, NOW);
      expect(result.status).toBe('OVERDUE');
      expect(result.overdueByKm).toBe(1000);
    });

    it('UNKNOWN quando o veiculo nao tem odometro atual conhecido', () => {
      const plan = { intervalKm: 10000, intervalDays: null, alertBeforeKm: 1000, alertBeforeDays: null };
      const result = evaluateMaintenancePlan(plan, { completedAt: null, odometerKm: 100000 }, null, NOW);
      expect(result.status).toBe('UNKNOWN');
    });
  });

  describe('criterio por data', () => {
    it('OVERDUE quando a data devida ja passou', () => {
      const plan = { intervalKm: null, intervalDays: 30, alertBeforeKm: null, alertBeforeDays: 5 };
      const lastService = { completedAt: new Date('2026-07-01T00:00:00.000Z'), odometerKm: null };
      const result = evaluateMaintenancePlan(plan, lastService, null, NOW);
      expect(result.status).toBe('OVERDUE');
      expect(result.overdueByDays).toBeGreaterThan(0);
    });

    it('DUE_SOON dentro da antecedencia configurada', () => {
      const plan = { intervalKm: null, intervalDays: 30, alertBeforeKm: null, alertBeforeDays: 5 };
      const lastService = { completedAt: new Date('2026-08-04T00:00:00.000Z'), odometerKm: null }; // vence 2026-09-03, faltam 2 dias
      const result = evaluateMaintenancePlan(plan, lastService, null, NOW);
      expect(result.status).toBe('DUE_SOON');
    });

    it('OK fora da antecedencia', () => {
      const plan = { intervalKm: null, intervalDays: 30, alertBeforeKm: null, alertBeforeDays: 5 };
      const lastService = { completedAt: new Date('2026-08-15T00:00:00.000Z'), odometerKm: null };
      const result = evaluateMaintenancePlan(plan, lastService, null, NOW);
      expect(result.status).toBe('OK');
    });
  });

  it('OVERDUE por km prevalece mesmo se a data ainda estiver OK (o que vencer primeiro decide)', () => {
    const plan = { intervalKm: 10000, intervalDays: 365, alertBeforeKm: 1000, alertBeforeDays: 5 };
    const lastService = { completedAt: new Date('2026-08-15T00:00:00.000Z'), odometerKm: 100000 };
    const result = evaluateMaintenancePlan(plan, lastService, 111000, NOW);
    expect(result.status).toBe('OVERDUE');
  });

  it('sem nenhum intervalo utilizavel (dados faltando) retorna UNKNOWN, nunca inventa status', () => {
    const plan = { intervalKm: 10000, intervalDays: null, alertBeforeKm: 1000, alertBeforeDays: null };
    const lastService = { completedAt: new Date('2026-08-15T00:00:00.000Z'), odometerKm: null }; // sem odometro na ultima
    const result = evaluateMaintenancePlan(plan, lastService, 111000, NOW);
    expect(result.status).toBe('UNKNOWN');
  });
});
