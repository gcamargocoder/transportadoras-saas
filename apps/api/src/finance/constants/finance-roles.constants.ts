import { UserRole } from '@prisma/client';

// Mesmo grupo financeiro/operacional ja usado por Contas a Receber (Fase
// 72) e Contas a Pagar (Fase 73): leitura ampla (inclui AUDITOR). Este
// modulo e SOMENTE LEITURA (nenhuma mutacao propria -- consolida dados ja
// existentes), entao nao existe um grupo de escrita.
export const FINANCE_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];
