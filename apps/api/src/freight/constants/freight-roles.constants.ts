import { UserRole } from '@prisma/client';

// Mesma politica ja aplicada a TripRevenue/TripExpense/Fiscal: leitura
// ampla (inclui AUDITOR), escrita restrita ao grupo operacional. DRIVER
// nunca acessa nenhuma rota deste modulo (nao ha fluxo comercial no Driver
// App nesta fase).
export const FREIGHT_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const FREIGHT_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
];
