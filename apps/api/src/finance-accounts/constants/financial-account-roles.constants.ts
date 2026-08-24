import { UserRole } from '@prisma/client';

// Fase 78 -- mesmo grupo financeiro/operacional ja usado por Contas a
// Receber/Pagar/Periodos/Auditoria (Fases 72-77): leitura ampla (inclui
// AUDITOR), escrita restrita. DRIVER nunca acessa nenhuma rota deste
// modulo.
export const FINANCIAL_ACCOUNT_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const FINANCIAL_ACCOUNT_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
];
