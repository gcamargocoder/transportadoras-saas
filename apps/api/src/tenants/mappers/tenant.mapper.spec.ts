import { TenantPlan, TenantPlanTier } from '@prisma/client';
import { toTenantPlanEntity } from './tenant.mapper';

function buildPlan(overrides: Partial<TenantPlan> = {}): TenantPlan {
  return {
    id: 'plan-1',
    tenantId: 'tenant-1',
    tier: TenantPlanTier.STARTER,
    trialStartedAt: null,
    trialEndsAt: null,
    maxUsers: null,
    maxVehicles: null,
    maxDrivers: null,
    maxStorageMb: null,
    enabledModules: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

const DAY = 24 * 60 * 60 * 1000;

describe('tenant.mapper -- toTenantPlanEntity (Fase 49, dados de trial)', () => {
  it('trialDaysRemaining e null quando o plano nao tem trialEndsAt', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const entity = toTenantPlanEntity(buildPlan(), now);
    expect(entity.trialDaysRemaining).toBeNull();
    expect(entity.trialExpiringSoon).toBe(false);
  });

  it('calcula dias restantes corretamente antes do vencimento (trial de varios dias)', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const trialEndsAt = new Date(now.getTime() + 10 * DAY);
    const entity = toTenantPlanEntity(buildPlan({ trialEndsAt }), now);
    expect(entity.trialDaysRemaining).toBe(10);
    expect(entity.trialExpiringSoon).toBe(false);
  });

  it('marca trialExpiringSoon quando faltam poucos dias (limiar de 3)', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const trialEndsAt = new Date(now.getTime() + 2 * DAY);
    const entity = toTenantPlanEntity(buildPlan({ trialEndsAt }), now);
    expect(entity.trialDaysRemaining).toBe(2);
    expect(entity.trialExpiringSoon).toBe(true);
  });

  it('exatamente no vencimento -- 0 dias restantes, ainda "expirando" (nao negativo)', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    const entity = toTenantPlanEntity(buildPlan({ trialEndsAt: now }), now);
    expect(entity.trialDaysRemaining).toBe(0);
    expect(entity.trialExpiringSoon).toBe(true);
  });

  it('depois do vencimento -- dias restantes negativo, nunca "expiringSoon"', () => {
    const now = new Date('2026-06-05T00:00:00.000Z');
    const trialEndsAt = new Date('2026-06-01T00:00:00.000Z');
    const entity = toTenantPlanEntity(buildPlan({ trialEndsAt }), now);
    expect(entity.trialDaysRemaining).toBeLessThan(0);
    expect(entity.trialExpiringSoon).toBe(false);
  });

  it('trial de 1 dia -- calcula 1 dia restante corretamente', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const trialEndsAt = new Date(now.getTime() + 1 * DAY);
    const entity = toTenantPlanEntity(buildPlan({ trialEndsAt }), now);
    expect(entity.trialDaysRemaining).toBe(1);
    expect(entity.trialExpiringSoon).toBe(true);
  });

  it('preserva trialStartedAt tal como veio do plano (nunca recalculado aqui)', () => {
    const trialStartedAt = new Date('2026-05-20T00:00:00.000Z');
    const entity = toTenantPlanEntity(buildPlan({ trialStartedAt }), new Date('2026-06-01T00:00:00.000Z'));
    expect(entity.trialStartedAt).toEqual(trialStartedAt);
  });
});
