import { UserRole } from '@prisma/client';

// Fase 40 -- gestao operacional da frota. Mesmo grupo amplo ja usado por
// GET /tires/dashboard e GET /fuel-supplies/dashboard (FLEET_READ_ROLES,
// fleet/constants/fleet-roles.constants.ts) -- deliberadamente NAO o
// DASHBOARD_ROLES mais estrito do dashboard executivo (esse e restrito de
// proposito a dado financeiro sensivel a nivel de diretoria; este modulo e
// leitura operacional do dia a dia, mesmo nivel de sensibilidade de
// manutencao/pneus/abastecimento).
export const FLEET_OPERATIONS_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];
