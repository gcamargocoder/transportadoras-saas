import { UserRole } from '@prisma/client';

// Dashboard executivo -- indicadores estrategicos (financeiro, frota,
// operacional) restritos a perfis de gestao. OPERATOR/DISPATCHER/AUDITOR/
// DRIVER recebem 403 (diferente de todo outro modulo do projeto, que
// sempre inclui AUDITOR na leitura -- aqui a leitura em si e o dado
// sensivel).
export const DASHBOARD_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER];
