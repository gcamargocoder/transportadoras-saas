import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { TenantRequest } from '../interfaces/tenant-request.interface';

// Extrai o Tenant resolvido pelo TenantGuard. So faz sentido em rotas
// protegidas (nao-@Public()) -- nelas, TenantGuard garante que `tenant`
// sempre existe antes do handler rodar.
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Tenant => {
    const request = ctx.switchToHttp().getRequest<TenantRequest>();
    return request.tenant as Tenant;
  },
);
