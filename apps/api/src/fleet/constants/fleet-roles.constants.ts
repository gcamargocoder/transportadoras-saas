import { UserRole } from '@prisma/client';

// Mesma politica de permissao do modulo de motoristas (Fase 6): leitura
// operacional ampla, escrita restrita a gestao. DRIVER nunca aparece aqui.
export const FLEET_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const FLEET_WRITE_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER];
