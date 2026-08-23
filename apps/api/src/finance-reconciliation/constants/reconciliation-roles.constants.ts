import { UserRole } from '@prisma/client';

// Mesmo grupo financeiro/operacional ja usado por Contas a Receber/Pagar/
// Fluxo de Caixa (Fases 72-74). Modulo SOMENTE LEITURA -- nenhuma mutacao
// propria (a conciliacao apenas detecta, nunca corrige automaticamente,
// secao 6 do pedido), entao nao existe grupo de escrita.
export const RECONCILIATION_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];
