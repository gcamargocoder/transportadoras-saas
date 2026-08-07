import { UserRole } from '@prisma/client';

// FuelStation e dado de cadastro/referencia do tenant (analogo a Fleet --
// ver fleet/constants/fleet-roles.constants.ts), nao um lancamento
// operacional do dia a dia -- escrita restrita a gestao.
export const FUEL_STATION_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const FUEL_STATION_WRITE_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER];
