import { UserRole } from '@prisma/client';

// Fase B -- periodos ociosos persistidos. Leitura reaproveita o MESMO grupo
// de fleet-operations (estas rotas alimentam a mesma Torre de Controle /
// auditoria de downtime). Escrita administrativa (criar/corrigir motivo/
// fechar manualmente) segue a MESMA politica de TRIP_STOP_WRITE_ROLES
// (Fase 43): nunca AUDITOR (leitura por definicao), nunca DRIVER.
export const VEHICLE_IDLE_PERIOD_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const VEHICLE_IDLE_PERIOD_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
];
