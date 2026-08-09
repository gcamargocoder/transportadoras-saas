import { Driver } from '@prisma/client';
import { TenantRequest } from '../../tenants/interfaces/tenant-request.interface';

// Request apos passar por DriverGuard (popula `driver`) -- so existe nas
// rotas do app do motorista (Fase 25).
export interface DriverRequest extends TenantRequest {
  driver?: Driver;
}
