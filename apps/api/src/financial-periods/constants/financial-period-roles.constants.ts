import { UserRole } from '@prisma/client';

// Fase 76 -- mesmo grupo financeiro/operacional ja usado por Contas a
// Receber/Pagar/Fluxo de Caixa/Conciliacao (Fases 72-75): leitura ampla
// (inclui AUDITOR), escrita restrita. DRIVER nunca acessa nenhuma rota
// deste modulo.
export const FINANCIAL_PERIOD_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const FINANCIAL_PERIOD_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
];
