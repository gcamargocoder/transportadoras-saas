// Chave de metadata do decorator @RequireModule() (Fase 48). Mesmo padrao
// de ROLES_KEY (apps/api/src/auth/constants/auth.constants.ts).
export const REQUIRE_MODULE_KEY = 'requireModule';

// Fase 49 -- duracao default do trial quando o SUPER_ADMIN move um tenant
// para TRIAL sem ja ter configurado TenantPlan.trialEndsAt via
// PATCH /tenants/:id/plan. Unico valor de duracao usado no ciclo de vida
// (nunca uma regra paralela de calculo de data).
export const DEFAULT_TRIAL_DURATION_DAYS = 14;

// Fase 49 -- limiar (em dias) para o frontend considerar o trial
// "expirando em breve" (GET /tenants/me -- TenantPlanEntity.trialExpiringSoon).
export const TRIAL_EXPIRING_SOON_THRESHOLD_DAYS = 3;
