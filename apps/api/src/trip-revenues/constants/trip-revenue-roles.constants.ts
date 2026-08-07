import { UserRole } from '@prisma/client';

// Mesma politica ja aplicada a TripExpense (Fase 16): registrar receita e
// operacional; leitura ampla incluindo AUDITOR.
export const TRIP_REVENUE_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const TRIP_REVENUE_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
];
