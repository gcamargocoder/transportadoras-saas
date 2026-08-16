import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../constants/auth.constants';

// Restringe uma rota a um ou mais perfis. Lido pelo RolesGuard global; sem
// este decorator, RolesGuard libera a rota para qualquer usuario
// autenticado -- por isso todo endpoint de escrita/admin/financeiro do
// projeto declara @Roles() explicitamente (auditado na Fase 46).
export const Roles = (...roles: UserRole[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, roles);
