import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../constants/auth.constants';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

// Guard global (registrado apos JwtAuthGuard via APP_GUARD): so restringe
// algo quando a rota tem @Roles(...). Sem essa metadata, libera qualquer
// usuario autenticado -- nenhum endpoint de negocio usa @Roles() ainda
// nesta fase, entao hoje e um no-op em todas as rotas existentes.
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
