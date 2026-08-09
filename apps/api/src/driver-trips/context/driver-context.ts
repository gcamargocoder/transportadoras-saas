import { Inject, Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { DriverRequest } from '../interfaces/driver-request.interface';

// Request-scoped, mesmo padrao de TenantContext -- so le o que DriverGuard ja
// anexou ao request, nunca faz consulta propria.
@Injectable({ scope: Scope.REQUEST })
export class DriverContext {
  constructor(@Inject(REQUEST) private readonly request: DriverRequest) {}

  get driverId(): string | undefined {
    return this.request.driver?.id;
  }

  requireDriverId(): string {
    if (!this.driverId) {
      throw new UnauthorizedException('Usuario nao autenticado como motorista.');
    }
    return this.driverId;
  }
}
