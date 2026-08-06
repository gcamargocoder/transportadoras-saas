import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { AuthTokensDto } from '../dto/auth-tokens.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { AuthenticatedUser } from '../entities/authenticated-user.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { AuthService } from '../services/auth.service';
import { extractRequestMetadata } from '../utils/request-metadata.util';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autentica com e-mail/senha e retorna access token + refresh token.' })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'E-mail ou senha invalidos.' })
  @ApiForbiddenResponse({ description: 'Usuario inativo.' })
  login(@Body() dto: LoginDto, @Req() request: Request): Promise<AuthTokensDto> {
    return this.authService.login(dto, extractRequestMetadata(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Emite um novo par access/refresh token a partir de um refresh token valido (rotacao).',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiUnauthorizedResponse({ description: 'Refresh token invalido, expirado ou revogado.' })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokensDto> {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoga o refresh token informado, encerrando a sessao atual.' })
  @ApiNoContentResponse({ description: 'Logout realizado (idempotente).' })
  @ApiUnauthorizedResponse({ description: 'Access token ausente ou invalido.' })
  async logout(@CurrentUser('sub') userId: string, @Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(userId, dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retorna os dados do usuario autenticado extraidos do access token.' })
  @ApiOkResponse({ type: AuthenticatedUser })
  @ApiUnauthorizedResponse({ description: 'Access token ausente ou invalido.' })
  me(@CurrentUser() user: JwtPayload): JwtPayload {
    return user;
  }
}
