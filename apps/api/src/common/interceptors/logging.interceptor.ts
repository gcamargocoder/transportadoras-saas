import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { extractRequestMetadata } from '../../auth/utils/request-metadata.util';

// Loga metodo, rota, IP, user agent, status e duracao de cada requisicao --
// NUNCA corpo, headers de autenticacao (Authorization/Cookie) ou qualquer
// segredo. Nao substitui logs de negocio -- e apenas observabilidade de
// infraestrutura (ver docs/SECURITY_AND_DEVELOPMENT_STANDARDS.md, secao 9).
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, originalUrl } = request;
    const { ipAddress, userAgent } = extractRequestMetadata(request);
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse<Response>();
          this.logger.log(
            `${method} ${originalUrl} ${response.statusCode} +${Date.now() - startedAt}ms ` +
              `ip=${ipAddress ?? 'unknown'} ua="${userAgent ?? 'unknown'}"`,
          );
        },
        error: (error: unknown) => {
          const stack = error instanceof Error ? error.stack : undefined;
          this.logger.error(
            `${method} ${originalUrl} +${Date.now() - startedAt}ms ` +
              `ip=${ipAddress ?? 'unknown'} ua="${userAgent ?? 'unknown'}"`,
            stack,
          );
        },
      }),
    );
  }
}
