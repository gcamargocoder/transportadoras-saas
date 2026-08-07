import { UserRole } from '@prisma/client';

// Transacoes de pedagio sao dado OPERACIONAL do tenant (mesma politica do
// modulo de viagens: OPERATOR/DISPATCHER registram pedagio no dia a dia).
// Pracas (TollPlaza) e operadoras (TagProvider) sao dado de referencia
// GLOBAL -- escrita restrita a UserRole.SUPER_ADMIN diretamente nos
// controllers correspondentes, nao usa estas constantes.
export const TOLL_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const TOLL_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
];
