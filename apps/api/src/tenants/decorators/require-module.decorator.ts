import { SetMetadata } from '@nestjs/common';
import { TenantModule } from '@prisma/client';
import { REQUIRE_MODULE_KEY } from '../constants/tenant.constants';

// Restringe uma rota a tenants com o modulo habilitado no plano (Fase 48).
// Lido pelo RequireModuleGuard global; sem este decorator, a rota nunca e
// bloqueada por modulo (mesmo principio de @Roles()/RolesGuard).
export const RequireModule = (module: TenantModule): ReturnType<typeof SetMetadata> =>
  SetMetadata(REQUIRE_MODULE_KEY, module);
