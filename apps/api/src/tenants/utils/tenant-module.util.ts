import { TenantModule } from '@prisma/client';

// Fase 47 -- funcao pura, testada isoladamente. Deliberadamente NAO
// conectada a nenhum guard/controller existente nesta fase: o pedido pede
// "preparar estrutura" e explicitamente "nao bloquear modulos existentes
// de forma arbitraria" -- conectar isso em todo controller do sistema
// seria uma mudanca funcional ampla fora do escopo desta fase (auditoria
// geral repetitiva). Fica pronta para uso em fase futura.
export function isModuleEnabled(
  plan: { enabledModules: TenantModule[] } | null | undefined,
  module: TenantModule,
): boolean {
  if (!plan) return false;
  return plan.enabledModules.includes(module);
}
