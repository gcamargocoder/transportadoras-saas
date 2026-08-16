import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantModule, UserRole } from '@prisma/client';
import { RequireModuleGuard } from './require-module.guard';
import { TenantRequest } from '../interfaces/tenant-request.interface';

function buildContext(request: Partial<TenantRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => (() => undefined) as unknown,
    getClass: () => (class {} as unknown),
  } as unknown as ExecutionContext;
}

function buildReflector(requiredModule: TenantModule | undefined): Reflector {
  return { getAllAndOverride: () => requiredModule } as unknown as Reflector;
}

describe('RequireModuleGuard', () => {
  it('libera quando a rota nao tem @RequireModule(...)', () => {
    const guard = new RequireModuleGuard(buildReflector(undefined));
    const context = buildContext({ user: { role: UserRole.ADMIN } as never });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('libera SUPER_ADMIN mesmo com o modulo desabilitado no proprio tenant "casa"', () => {
    const guard = new RequireModuleGuard(buildReflector(TenantModule.TRIPS));
    const context = buildContext({
      user: { role: UserRole.SUPER_ADMIN } as never,
      tenant: { plan: { enabledModules: [] } } as never,
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('libera quando o modulo esta habilitado no plano do tenant', () => {
    const guard = new RequireModuleGuard(buildReflector(TenantModule.TRIPS));
    const context = buildContext({
      user: { role: UserRole.ADMIN } as never,
      tenant: { plan: { enabledModules: [TenantModule.TRIPS] } } as never,
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('bloqueia com ForbiddenException quando o modulo esta desabilitado no plano do tenant', () => {
    const guard = new RequireModuleGuard(buildReflector(TenantModule.TRIPS));
    const context = buildContext({
      user: { role: UserRole.ADMIN } as never,
      tenant: { plan: { enabledModules: [TenantModule.TOLLS] } } as never,
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('bloqueia quando o tenant nao tem plano algum', () => {
    const guard = new RequireModuleGuard(buildReflector(TenantModule.TRIPS));
    const context = buildContext({ user: { role: UserRole.ADMIN } as never, tenant: { plan: null } as never });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
