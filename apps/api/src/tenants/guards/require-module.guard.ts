import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantModule, UserRole } from '@prisma/client';
import { REQUIRE_MODULE_KEY } from '../constants/tenant.constants';
import { PLAN_ERRORS } from '../constants/plan-error.constants';
import { TenantRequest } from '../interfaces/tenant-request.interface';
import { isModuleEnabled } from '../utils/tenant-module.util';

// Guard global (registrado apos TenantGuard via APP_GUARD, Fase 48): so
// restringe algo quando a rota tem @RequireModule(...). Sem essa metadata,
// libera qualquer request -- mesmo principio de RolesGuard/@Roles(). Nunca
// bloqueia SUPER_ADMIN (administracao global da plataforma nao deve
// depender do plano do proprio tenant "casa", mesmo criterio ja usado pelo
// fix de isActive no TenantGuard na Fase 47). Reaproveita isModuleEnabled()
// (Fase 47) contra o `plan` ja anexado ao request pelo TenantGuard -- zero
// query nova por requisicao.
@Injectable()
export class RequireModuleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredModule = this.reflector.getAllAndOverride<TenantModule | undefined>(
      REQUIRE_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredModule) {
      return true;
    }

    const request = context.switchToHttp().getRequest<TenantRequest>();
    if (request.user?.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    if (!isModuleEnabled(request.tenant?.plan, requiredModule)) {
      throw new ForbiddenException(PLAN_ERRORS.MODULE_DISABLED);
    }

    return true;
  }
}
