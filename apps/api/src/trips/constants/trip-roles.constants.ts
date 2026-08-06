import { UserRole } from '@prisma/client';

// Diferente de Fleet/Drivers: OPERATOR e DISPATCHER tem escrita aqui (cadastrar
// e editar viagens e literalmente a funcao operacional deles). DRIVER nunca
// aparece -- o app do motorista (fase futura) tera sua propria API, nao este
// modulo administrativo.
export const TRIP_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const TRIP_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
];
