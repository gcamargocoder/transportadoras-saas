import { UserRole } from '@prisma/client';

// Fase 77 -- mesmo grupo financeiro/operacional ja usado pelos demais
// modulos financeiros (Fases 72-76): leitura ampla (inclui AUDITOR).
// Modulo SOMENTE LEITURA (AuditLog nunca e mutavel pela API -- ver secao
// 9 do pedido), entao nao existe grupo de escrita.
export const FINANCE_AUDIT_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];
