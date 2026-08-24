import { UserRole } from '@prisma/client';

// Fase 80, secao 14 -- mesmo grupo financeiro/operacional dos demais
// modulos financeiros (Fases 72-79): leitura ampla (inclui AUDITOR, que
// pode consultar mas nunca importar/conciliar/desconciliar); escrita
// restrita. DRIVER nunca acessa nenhuma rota deste modulo.
export const BANK_RECONCILIATION_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];

export const BANK_RECONCILIATION_WRITE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
];
