import { Tenant } from '@prisma/client';
import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';

// Request apos passar por TenantGuard (popula `tenant`) e TenantInterceptor
// (popula `requestMetadata`). `tenant` fica opcional no tipo porque rotas
// publicas (@Public()) nunca passam pelo TenantGuard.
export interface TenantRequest extends AuthenticatedRequest {
  tenant?: Tenant;
  requestMetadata?: RequestMetadata;
}
