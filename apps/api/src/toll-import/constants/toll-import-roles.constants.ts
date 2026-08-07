import { UserRole } from '@prisma/client';

// Importar extrato e uma acao operacional do dia a dia (mesma politica do
// registro manual de pedagio -- ver tolls/constants/toll-roles.constants.ts).
export const TOLL_IMPORT_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const TOLL_IMPORT_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
];
