// Parte 11 do pedido -- persistência do onboarding concluído/dispensado.
//
// Decisão de arquitetura (registrada no relatório final, ver também
// docs/help-center.md): verificado que NÃO existe hoje nenhum mecanismo de
// preferência POR USUÁRIO no backend (UserAccount não tem campo de
// preferências/JSON). TenantSettings.preferences existe, mas é por TENANT
// (compartilhado por todos os usuários da transportadora) -- inadequado
// para "este usuário específico já viu a introdução", já que marcaria o
// onboarding como visto para todo mundo do tenant ao mesmo tempo.
//
// Como o objetivo desta primeira versão (Parte 11) é proporcional -- "se
// uma solução client-side/local puder cumprir adequadamente o objetivo,
// considerar essa alternativa" --, a decisão foi usar localStorage,
// chaveado por tenantId+userId (nunca só por navegador, para não misturar
// usuários diferentes no mesmo computador compartilhado). Sem
// migration/endpoint novo. Se no futuro for necessário que o onboarding
// "siga" o usuário entre dispositivos, aí sim caberia um campo de
// preferências no backend -- fora do escopo desta fase.
function storageKey(tenantId: string, userId: string): string {
  return `help.onboarding.dismissed.${tenantId}.${userId}`;
}

export function isOnboardingDismissed(tenantId: string, userId: string): boolean {
  try {
    return localStorage.getItem(storageKey(tenantId, userId)) === '1';
  } catch {
    return false;
  }
}

export function setOnboardingDismissed(tenantId: string, userId: string): void {
  try {
    localStorage.setItem(storageKey(tenantId, userId), '1');
  } catch {
    // Armazenamento indisponível (modo privado, quota, etc.) -- o
    // onboarding simplesmente reaparecerá na próxima visita, sem quebrar a
    // experiência.
  }
}
