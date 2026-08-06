import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

// Extrai o usuario autenticado (populado pela JwtAccessStrategy) do request.
// Uso: @CurrentUser() user: JwtPayload  -- payload inteiro
//      @CurrentUser('sub') userId: string -- apenas um campo
export const CurrentUser = createParamDecorator(
  (
    field: keyof JwtPayload | undefined,
    ctx: ExecutionContext,
  ): JwtPayload | JwtPayload[keyof JwtPayload] => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return field ? request.user[field] : request.user;
  },
);
