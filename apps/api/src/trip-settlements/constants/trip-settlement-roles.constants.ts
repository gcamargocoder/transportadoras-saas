import { UserRole } from '@prisma/client';

// Consultar o fechamento e uma leitura operacional ampla; fechar/reabrir e
// uma decisao financeira -- mesma politica ja usada para aprovar/rejeitar/
// cancelar despesa (ver trip-expenses/constants), restrita a perfis de gestao.
export const TRIP_SETTLEMENT_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const TRIP_SETTLEMENT_CLOSE_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER];
