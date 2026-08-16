import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserAccount } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { TokenExpiredError } from 'jsonwebtoken';
import { AuditService } from '../../audit/services/audit.service';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { AUTH_ERRORS } from '../constants/auth-error.constants';
import { AuthTokensDto } from '../dto/auth-tokens.dto';
import { LoginDto } from '../dto/login.dto';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { RefreshTokenPayload } from '../interfaces/refresh-token-payload.interface';
import { TokenPair } from '../types/token-pair.type';
import { addDuration } from '../utils/duration.util';
import { verifyPassword } from '../utils/password.util';
import { RequestMetadata } from '../utils/request-metadata.util';
import { hashToken } from '../utils/token-hash.util';
import { toAuthenticatedUser, toJwtPayload } from '../utils/user-mapper.util';
import { LoginProtectionService } from './login-protection.service';

const EMPTY_REQUEST_METADATA: RequestMetadata = { userAgent: null, ipAddress: null };

@Injectable()
export class AuthService {
  private readonly jwtConfig: AppConfig['jwt'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
    private readonly loginProtection: LoginProtectionService,
    configService: ConfigService<AppConfig, true>,
  ) {
    this.jwtConfig = configService.get('jwt', { infer: true });
  }

  async login(
    dto: LoginDto,
    metadata: RequestMetadata = EMPTY_REQUEST_METADATA,
  ): Promise<AuthTokensDto> {
    // Bloqueio temporario por conta (Fase 46) -- checado ANTES de tocar no
    // banco/argon2 (curto-circuito barato) e ANTES de qualquer
    // recordFailure() abaixo, para nunca estender o proprio lockout. A
    // resposta permanece IDENTICA (401 generico) esteja bloqueado ou nao --
    // nunca revela ao cliente que a conta esta temporariamente bloqueada.
    if (this.loginProtection.isLocked(dto.tenantId, dto.email)) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
    }

    // Chave composta (tenantId + email): o schema so garante unicidade de
    // e-mail DENTRO de um tenant (@@unique([tenantId, email])) -- NUNCA
    // buscar so por e-mail, o mesmo e-mail pode existir em tenants
    // diferentes. findUnique usa exatamente esse indice composto.
    const user = await this.prisma.userAccount.findUnique({
      where: { tenantId_email: { tenantId: dto.tenantId, email: dto.email } },
    });

    if (!user || user.deletedAt) {
      // Sem auditoria aqui de proposito: nao ha um tenantId/userId validado
      // para atribuir a entrada (tenantId pode nem existir) -- registrar
      // exigiria uma FK falsa ou um formato de auditoria paralelo, o que
      // fugiria do padrao unico de AuditLog. O contador de brute force
      // (por tenantId+email, real ou nao) continua contando normalmente.
      this.loginProtection.recordFailure(dto.tenantId, dto.email);
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
    }

    const passwordMatches = await verifyPassword(user.passwordHash, dto.password);
    if (!passwordMatches) {
      this.loginProtection.recordFailure(dto.tenantId, dto.email);
      await this.audit.log({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'auth.login_failed',
        entityName: 'UserAccount',
        entityId: user.id,
        newValue: { reason: 'invalid_password' },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS);
    }

    if (!user.isActive) {
      throw new ForbiddenException(AUTH_ERRORS.USER_INACTIVE);
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: user.tenantId } });
    if (!tenant || !tenant.isActive) {
      throw new ForbiddenException(AUTH_ERRORS.TENANT_INACTIVE);
    }

    this.loginProtection.recordSuccess(dto.tenantId, dto.email);
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'auth.login_succeeded',
      entityName: 'UserAccount',
      entityId: user.id,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.issueTokens(user, metadata);
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokensDto> {
    const payload = await this.verifyRefreshToken(refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });
    const isValidStoredToken =
      stored !== null &&
      stored.revokedAt === null &&
      stored.expiresAt.getTime() > Date.now() &&
      stored.tokenHash === hashToken(refreshToken);

    if (!isValidStoredToken) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_REFRESH_TOKEN);
    }

    const user = await this.prisma.userAccount.findUnique({ where: { id: stored.userId } });
    if (!user || user.deletedAt || !user.isActive) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_REFRESH_TOKEN);
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: user.tenantId } });
    if (!tenant || !tenant.isActive) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_REFRESH_TOKEN);
    }

    // Rotacao: o refresh token usado e revogado imediatamente e um novo par
    // e emitido. Se o token antigo for reapresentado depois disso (replay),
    // a checagem `revokedAt === null` acima ja bloqueia.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(user, EMPTY_REQUEST_METADATA);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.jwtConfig.refreshSecret,
      });
    } catch {
      // Token ja invalido/expirado: nao ha nada para revogar, mas logout
      // deve ser idempotente -- nunca falha por causa disso.
      return;
    }

    // Filtra por userId tambem: um usuario so pode revogar as PROPRIAS
    // sessoes, mesmo que de alguma forma soubesse o jti de outra pessoa.
    await this.prisma.refreshToken.updateMany({
      where: { id: payload.jti, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async verifyRefreshToken(refreshToken: string): Promise<RefreshTokenPayload> {
    try {
      return await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.jwtConfig.refreshSecret,
      });
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException(AUTH_ERRORS.REFRESH_TOKEN_EXPIRED);
      }
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_REFRESH_TOKEN);
    }
  }

  private async issueTokens(user: UserAccount, metadata: RequestMetadata): Promise<AuthTokensDto> {
    const { accessToken, refreshToken, refreshTokenId } = await this.signTokenPair(user);

    await this.prisma.refreshToken.create({
      data: {
        id: refreshTokenId,
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: addDuration(this.jwtConfig.refreshExpiresIn),
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.jwtConfig.accessExpiresIn,
      user: toAuthenticatedUser(user),
    };
  }

  private async signTokenPair(user: UserAccount): Promise<TokenPair & { refreshTokenId: string }> {
    const accessPayload: JwtPayload = toJwtPayload(user);
    const refreshTokenId = randomUUID();
    const refreshPayload: RefreshTokenPayload = { sub: user.id, jti: refreshTokenId };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.jwtConfig.accessSecret,
        expiresIn: this.jwtConfig.accessExpiresIn,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.jwtConfig.refreshSecret,
        expiresIn: this.jwtConfig.refreshExpiresIn,
      }),
    ]);

    return { accessToken, refreshToken, refreshTokenId };
  }
}
