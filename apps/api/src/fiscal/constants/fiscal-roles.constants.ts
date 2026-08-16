import { UserRole } from '@prisma/client';

// Fase 52 -- mesma politica de leitura/escrita ja usada por
// toll-import/checklists (operacao do dia a dia). DRIVER nunca acessa (nao
// listado): documentos fiscais sao geridos pela operacao administrativa,
// nao pelo app do motorista.
export const FISCAL_DOCUMENTS_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const FISCAL_DOCUMENTS_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
];
