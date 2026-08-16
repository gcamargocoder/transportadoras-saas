import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../constants/auth.constants';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

// Guard global (registrado apos JwtAuthGuard via APP_GUARD): so restringe
// algo quando a rota tem @Roles(...). Sem essa metadata, libera qualquer
// usuario autenticado -- @Roles() ja esta em uso amplo em endpoints de
// negocio (vehicles, users, tenants, toll-*, fleet-operations etc.),
// auditado na Fase 46; controllers que legitimamente nao usam @Roles()
// sao os pre-autenticacao (auth) e o health check.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return Boolean(user) && requiredRoles.includes(user.role as UserRole);
  }
}
