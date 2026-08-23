import { UserRole } from '@prisma/client';

// Mesmo grupo financeiro/operacional ja usado pelo modulo de Faturamento
// (Fase 60, ver billing-operational/constants/billing-roles.constants.ts):
// leitura ampla (inclui AUDITOR), escrita restrita. DRIVER nunca acessa
// nenhuma rota deste modulo (contas a receber e um dominio administrativo,
// nunca exposto no Driver App).
export const RECEIVABLE_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const RECEIVABLE_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
];
