import { UserRole } from '@prisma/client';

// Registrar despesa e uma acao operacional do dia a dia (mesma politica de
// TOLL_WRITE_ROLES/TRIP_WRITE_ROLES) -- ja aprovar/rejeitar/cancelar/excluir
// exige um perfil de gestao (ver TRIP_EXPENSE_APPROVAL_ROLES), por instrucao
// explicita da Fase 16 ("Somente perfis autorizados podem: aprovar,
// rejeitar, cancelar, excluir").
export const TRIP_EXPENSE_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const TRIP_EXPENSE_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
];

export const TRIP_EXPENSE_APPROVAL_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER];
