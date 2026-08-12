import { UserRole } from '@prisma/client';

// Fase 43 -- leitura reaproveita o MESMO grupo de fleet-operations
// (FLEET_OPERATIONS_READ_ROLES): estas rotas alimentam o mesmo dashboard.
// Escrita administrativa (criar/fechar/cancelar parada sem passar pelo
// driver-app) e mais restrita -- mesma politica de TRIP_WRITE_ROLES (nunca
// AUDITOR, que e so leitura por definicao).
export const TRIP_STOP_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const TRIP_STOP_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
];
