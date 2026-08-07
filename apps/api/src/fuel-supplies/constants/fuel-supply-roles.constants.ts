import { UserRole } from '@prisma/client';

// FuelSupply e um lancamento operacional do dia a dia (mesma politica de
// TripExpense/TollTransaction) -- escrita inclui OPERATOR/DISPATCHER.
export const FUEL_SUPPLY_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const FUEL_SUPPLY_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
];
