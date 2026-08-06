import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AppConfig } from '../../config/configuration';
import { ApiErrorResponse } from '../interfaces/api-response.interface';

const GENERIC_INTERNAL_ERROR_MESSAGE = 'Erro interno do servidor.';

// Filtro global de excecoes: garante que TODA resposta de erro da API (
// HttpException conhecida ou erro inesperado) siga o mesmo formato JSON,
// nunca vazando stack trace/detalhes internos para o cliente. Em producao,
// qualquer excecao que NAO seja uma HttpException deliberada (ex: erro do
// Prisma, erro de conexao, bug nao tratado) tem sua mensagem original
// substituida por uma generica -- so o log server-side (nunca a resposta)
// preserva o detalhe real para investigacao.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isProduction = this.configService.get('env', { infer: true }) === 'production';
    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const error = isHttpException ? exception.name : 'InternalServerError';
    const message = this.extractMessage(exception, isHttpException, isProduction);

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

  private extractMessage(
    exception: unknown,
    isHttpException: boolean,
    isProduction: boolean,
  ): string | string[] {
    if (isHttpException) {
      // Mensagem de uma HttpException e sempre deliberada (lancada por
      // codigo nosso, ex: NotFoundException/ConflictException com texto
      // voltado ao usuario) -- segura para retornar em qualquer ambiente.
      const response = (exception as HttpException).getResponse();
      if (typeof response === 'string') return response;
      if (response && typeof response === 'object' && 'message' in response) {
        return (response as { message: string | string[] }).message;
      }
    }
    // Qualquer outra excecao (Prisma, erro de rede, bug nao tratado) e
    // potencialmente sensivel (SQL, paths, nomes internos) -- em producao
    // nunca expor exception.message ao cliente, apenas em log.
    if (isProduction) return GENERIC_INTERNAL_ERROR_MESSAGE;
    if (exception instanceof Error) return exception.message;
    return GENERIC_INTERNAL_ERROR_MESSAGE;
  }
}
