import { UserRole } from '@prisma/client';

// Mesma politica de FLEET_READ_ROLES/FLEET_WRITE_ROLES (Fase 6) -- leitura
// operacional ampla, escrita restrita a gestao. DRIVER nunca aparece aqui
// (a area do motorista usa DriverGuard, nao @Roles, ver DriverTripsController).
export const CHECKLISTS_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const CHECKLISTS_WRITE_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER];
