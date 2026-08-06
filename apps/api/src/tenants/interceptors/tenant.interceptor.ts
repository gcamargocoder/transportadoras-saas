import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { extractRequestMetadata } from '../../auth/utils/request-metadata.util';
import { TenantRequest } from '../interfaces/tenant-request.interface';

// Interceptor global: enriquece a requisicao com metadados (IP/User-Agent)
// consumidos pelo TenantContext e pelos services para auditoria. Nunca
// rejeita a requisicao (isso e responsabilidade do TenantGuard) -- roda em
// toda rota, publica ou nao, para que a auditoria de login/criacao de
// tenant (rotas publicas) tambem tenha IP/User-Agent disponivel.
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    request.requestMetadata = extractRequestMetadata(request);
    return next.handle();
  }
}
