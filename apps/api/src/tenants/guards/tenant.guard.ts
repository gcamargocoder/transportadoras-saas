import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_ERRORS } from '../../auth/constants/auth-error.constants';
import { IS_PUBLIC_KEY } from '../../auth/constants/auth.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantRequest } from '../interfaces/tenant-request.interface';

// Guard global (registrado apos JwtAuthGuard/RolesGuard via APP_GUARD):
// TODA requisicao autenticada precisa ter um Tenant existente e ATIVO --
// nao basta o access token ser valido. Anexa o Tenant resolvido em
// `request.tenant` para @CurrentTenant()/TenantContext reaproveitarem sem
// nova consulta.
//
// Validacao feita aqui e na camada de aplicacao (nao apenas no banco via
// RLS) de proposito: prepara o terreno para RLS no Postgres no futuro
// (ver comentario em schema.prisma), mas nao depende dele -- a garantia de
// isolamento hoje vem inteiramente desta checagem + do filtro por tenantId
// em cada query dos services (TenantsService/UsersService).
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<TenantRequest>();
    const tenantId = request.user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException(AUTH_ERRORS.TENANT_NOT_FOUND);
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || !tenant.isActive) {
      throw new ForbiddenException(AUTH_ERRORS.TENANT_INACTIVE);
    }

    request.tenant = tenant;
    return true;
  }
}
