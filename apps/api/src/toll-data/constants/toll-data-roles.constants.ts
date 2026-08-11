import { UserRole } from '@prisma/client';

// Catalogo de pedagios e dado de referencia GLOBAL (Fase 33), mesmo padrao
// ja usado em TollPlaza/TagProvider: leitura aberta a papeis operacionais,
// escrita (sincronizar, registrar tarifa oficial) restrita a SUPER_ADMIN --
// nunca motorista (secao 11 da fase: "nunca permitir que motorista execute
// sincronizacao global").
export const TOLL_DATA_READ_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
  UserRole.AUDITOR,
];
