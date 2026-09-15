import { beforeEach, describe, expect, it } from 'vitest';
import { isOnboardingDismissed, setOnboardingDismissed } from './onboarding-storage';

// Parte 11 do pedido: sem mecanismo de preferência por usuário no backend
// hoje (UserAccount não tem campo de preferências; TenantSettings.preferences
// é por TENANT, compartilhado por todos os usuários -- inadequado para "este
// usuário já viu o onboarding"). Decisão registrada: localStorage, chaveado
// por tenantId+userId (nunca só por navegador) -- ver docs/help-center.md.
describe('onboarding-storage (localStorage, chaveado por tenant+usuário)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('usuário que nunca viu o onboarding: não está marcado como dismissed', () => {
    expect(isOnboardingDismissed('tenant-1', 'user-1')).toBe(false);
  });

  it('marcar como dismissed e consultar de novo retorna true', () => {
    setOnboardingDismissed('tenant-1', 'user-1');
    expect(isOnboardingDismissed('tenant-1', 'user-1')).toBe(true);
  });

  it('dismissal de um usuário nunca afeta outro usuário do MESMO tenant (navegador compartilhado)', () => {
    setOnboardingDismissed('tenant-1', 'user-1');
    expect(isOnboardingDismissed('tenant-1', 'user-2')).toBe(false);
  });

  it('dismissal de um tenant nunca afeta outro tenant com o mesmo userId (coincidência improvável mas não deve vazar)', () => {
    setOnboardingDismissed('tenant-1', 'user-1');
    expect(isOnboardingDismissed('tenant-2', 'user-1')).toBe(false);
  });

  it('nunca lança erro se localStorage estiver indisponível (ex: modo privado) -- degrada para "não visto"', () => {
    const original = globalThis.localStorage;
    // @ts-expect-error -- simula ambiente sem localStorage
    delete globalThis.localStorage;
    expect(() => isOnboardingDismissed('tenant-1', 'user-1')).not.toThrow();
    expect(isOnboardingDismissed('tenant-1', 'user-1')).toBe(false);
    expect(() => setOnboardingDismissed('tenant-1', 'user-1')).not.toThrow();
    globalThis.localStorage = original;
  });
});
