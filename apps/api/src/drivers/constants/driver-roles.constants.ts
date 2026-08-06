import { UserRole } from '@prisma/client';

// Politica de permissao do modulo centralizada aqui (unica fonte de
// verdade) em vez de repetir a lista de roles em cada @Roles(...) do
// controller. DRIVER nunca aparece em nenhuma das duas listas -- motoristas
// nao acessam este modulo administrativo.
export const DRIVER_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const DRIVER_WRITE_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER];
