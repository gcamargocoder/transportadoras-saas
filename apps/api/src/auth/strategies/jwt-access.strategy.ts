import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfig } from '../../config/configuration';
import { JWT_ACCESS_STRATEGY } from '../constants/auth.constants';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

// Valida o access token (Authorization: Bearer <token>). O Passport ja
// verifica assinatura e expiracao antes de chamar validate() -- aqui so
// repassamos o payload decodificado, que vira `request.user`.
@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, JWT_ACCESS_STRATEGY) {
  constructor(configService: ConfigService<AppConfig, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwt.accessSecret', { infer: true }),
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
