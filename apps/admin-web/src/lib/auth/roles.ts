import { UserRole } from '../../types/enums';

// Espelha 1:1 as constantes de RBAC de cada modulo do backend (ver
// apps/api/src/**/constants/*-roles.constants.ts). Nao inventar politicas
// novas aqui -- o backend continua a UNICA autoridade real (403 se a UI
// deixar passar algo por engano); isto so evita mostrar acoes/menus que o
// usuario nao pode executar.
export const DASHBOARD_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER];

export const OPERATIONAL_READ_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const OPERATIONAL_WRITE_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
];

export const MANAGEMENT_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
];

export const TRIP_READ_ROLES = OPERATIONAL_READ_ROLES;
export const TRIP_WRITE_ROLES = OPERATIONAL_WRITE_ROLES;
export const TOLL_READ_ROLES = OPERATIONAL_READ_ROLES;
export const TOLL_WRITE_ROLES = OPERATIONAL_WRITE_ROLES;
export const TOLL_IMPORT_READ_ROLES = OPERATIONAL_READ_ROLES;
export const TOLL_IMPORT_WRITE_ROLES = OPERATIONAL_WRITE_ROLES;
export const FLEET_READ_ROLES = OPERATIONAL_READ_ROLES;
export const FLEET_WRITE_ROLES = MANAGEMENT_ROLES;
export const DRIVER_READ_ROLES = OPERATIONAL_READ_ROLES;
export const DRIVER_WRITE_ROLES = MANAGEMENT_ROLES;
export const FUEL_STATION_READ_ROLES = OPERATIONAL_READ_ROLES;
export const FUEL_STATION_WRITE_ROLES = MANAGEMENT_ROLES;
export const FUEL_SUPPLY_READ_ROLES = OPERATIONAL_READ_ROLES;
export const FUEL_SUPPLY_WRITE_ROLES = OPERATIONAL_WRITE_ROLES;
export const TRIP_EXPENSE_READ_ROLES = OPERATIONAL_READ_ROLES;
export const TRIP_EXPENSE_WRITE_ROLES = OPERATIONAL_WRITE_ROLES;
export const TRIP_EXPENSE_APPROVAL_ROLES = MANAGEMENT_ROLES;
export const TRIP_REVENUE_READ_ROLES = OPERATIONAL_READ_ROLES;
export const TRIP_REVENUE_WRITE_ROLES = OPERATIONAL_WRITE_ROLES;
export const TRIP_ADVANCE_READ_ROLES = OPERATIONAL_READ_ROLES;
export const TRIP_ADVANCE_WRITE_ROLES = OPERATIONAL_WRITE_ROLES;
export const TRIP_SETTLEMENT_READ_ROLES = OPERATIONAL_READ_ROLES;
export const TRIP_SETTLEMENT_CLOSE_ROLES = MANAGEMENT_ROLES;
export const TIRE_READ_ROLES = OPERATIONAL_READ_ROLES;
export const TIRE_WRITE_ROLES = MANAGEMENT_ROLES;

export const ADMIN_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN];
export const SUPER_ADMIN_ONLY: UserRole[] = [UserRole.SUPER_ADMIN];

// Lista vazia = liberado para qualquer usuario autenticado (ex: GET
// /tenants/me nao tem @Roles no controller).
export function hasRole(userRole: UserRole | undefined | null, allowed: UserRole[]): boolean {
  if (allowed.length === 0) return Boolean(userRole);
  if (!userRole) return false;
  return allowed.includes(userRole);
}
