import { UserRole } from '@prisma/client';

// Mesmo grupo financeiro/operacional ja usado por Faturamento (Fase 60) e
// Contas a Receber (Fase 72): leitura ampla (inclui AUDITOR), escrita
// restrita. DRIVER nunca acessa nenhuma rota deste modulo.
export const PAYABLE_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const PAYABLE_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
];
