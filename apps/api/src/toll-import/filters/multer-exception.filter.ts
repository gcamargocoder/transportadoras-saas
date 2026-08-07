import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { MulterError } from 'multer';
import { ApiErrorResponse } from '../../common/interfaces/api-response.interface';

// MulterError (ex: LIMIT_FILE_SIZE) nao e uma HttpException -- sem este
// filtro, o AllExceptionsFilter global trataria como erro interno generico
// (500). Aqui convertemos para o mesmo formato de erro padronizado do
// resto da API, com status 400 (erro do cliente: arquivo grande demais).
@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body: ApiErrorResponse = {
      success: false,
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'BadRequestException',
      message: this.toMessage(exception),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(HttpStatus.BAD_REQUEST).json(body);
  }

  private toMessage(exception: MulterError): string {
    if (exception.code === 'LIMIT_FILE_SIZE') {
      return 'Arquivo excede o tamanho maximo permitido.';
    }
    return `Falha no upload do arquivo: ${exception.message}`;
  }
}
