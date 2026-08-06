import { Inject, Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Tenant } from '@prisma/client';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AUTH_ERRORS } from '../../auth/constants/auth-error.constants';
import { TenantRequest } from '../interfaces/tenant-request.interface';

const EMPTY_METADATA: RequestMetadata = { ipAddress: null, userAgent: null };

// Request-scoped: uma instancia nova por requisicao HTTP (Nest cuida disso
// automaticamente por injetar REQUEST). Le o que TenantGuard/TenantInterceptor
// ja anexaram ao request -- nao faz nenhuma consulta propria. E o "modelo de
// leitura" unico consumido tanto por controllers quanto por services que
// precisem do tenant/usuario atual sem receber isso por parametro em toda
// assinatura de metodo.
@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  constructor(@Inject(REQUEST) private readonly request: TenantRequest) {}

  get tenant(): Tenant | undefined {
    return this.request.tenant;
  }

  get tenantId(): string | undefined {
    return this.request.tenant?.id ?? this.request.user?.tenantId ?? undefined;
  }

  get userId(): string | undefined {
    return this.request.user?.sub;
  }

  get role(): string | undefined {
    return this.request.user?.role;
  }

  get requestMetadata(): RequestMetadata {
    return this.request.requestMetadata ?? EMPTY_METADATA;
  }

  requireTenantId(): string {
    if (!this.tenantId) {
      throw new UnauthorizedException(AUTH_ERRORS.TENANT_NOT_FOUND);
    }
    return this.tenantId;
  }

  requireUserId(): string {
    if (!this.userId) {
      throw new UnauthorizedException('Usuario nao autenticado.');
    }
    return this.userId;
  }
}
