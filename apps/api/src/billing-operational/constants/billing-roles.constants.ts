import { UserRole } from '@prisma/client';

// Mesmo grupo operacional ja usado pelo modulo Freight (Fase 59): leitura
// ampla (inclui AUDITOR), escrita restrita. DRIVER nunca acessa nenhuma
// rota deste modulo. SUPER_ADMIN nunca e bloqueado por este array -- o
// RolesGuard sempre libera SUPER_ADMIN independente da lista (mesmo
// padrao global ja usado em toda a API).
export const BILLING_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const BILLING_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
];
