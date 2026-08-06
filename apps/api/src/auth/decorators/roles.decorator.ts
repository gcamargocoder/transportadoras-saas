import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../constants/auth.constants';

// Restringe uma rota a um ou mais perfis. Lido pelo RolesGuard global; sem
// este decorator, RolesGuard libera a rota para qualquer usuario autenticado
// (nenhum endpoint de negocio usa isso ainda nesta fase).
export const Roles = (...roles: UserRole[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, roles);
