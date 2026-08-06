import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { Observable } from 'rxjs';
import { AUTH_ERRORS } from '../constants/auth-error.constants';
import { IS_PUBLIC_KEY, JWT_ACCESS_STRATEGY } from '../constants/auth.constants';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

// Guard global (registrado via APP_GUARD em AuthModule): toda rota exige
// access token valido por padrao. @Public() e a unica forma de escapar
// disso -- rotas de login/refresh e o health check usam esse decorator.
@Injectable()
export class JwtAuthGuard extends AuthGuard(JWT_ACCESS_STRATEGY) {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  override handleRequest<TUser = JwtPayload>(
    err: unknown,
    user: TUser | false,
    info: unknown,
  ): TUser {
    if (err || !user) {
      if (info instanceof TokenExpiredError) {
        throw new UnauthorizedException(AUTH_ERRORS.TOKEN_EXPIRED);
      }
      if (info instanceof JsonWebTokenError) {
        throw new UnauthorizedException(AUTH_ERRORS.INVALID_TOKEN);
      }
      throw err instanceof Error ? err : new UnauthorizedException(AUTH_ERRORS.INVALID_TOKEN);
    }
    return user;
  }
}
