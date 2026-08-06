import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse } from '../interfaces/api-response.interface';

// Filtro global de excecoes: garante que TODA resposta de erro da API (
// HttpException conhecida ou erro inesperado) siga o mesmo formato JSON,
// nunca vazando stack trace/detalhes internos para o cliente.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const error = isHttpException ? exception.name : 'InternalServerError';
    const message = this.extractMessage(exception, isHttpException);

    const body: ApiErrorResponse = {
      success: false,
      statusCode,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(`${request.method} ${request.url} -> ${statusCode}`, stack);
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${statusCode}: ${JSON.stringify(message)}`,
      );
    }

    response.status(statusCode).json(body);
  }

  private extractMessage(exception: unknown, isHttpException: boolean): string | string[] {
    if (isHttpException) {
      const response = (exception as HttpException).getResponse();
      if (typeof response === 'string') return response;
      if (response && typeof response === 'object' && 'message' in response) {
        return (response as { message: string | string[] }).message;
      }
    }
    if (exception instanceof Error) return exception.message;
    return 'Erro interno do servidor';
  }
}
