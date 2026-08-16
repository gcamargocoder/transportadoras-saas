import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './controllers/auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuthService } from './services/auth.service';
import { LoginProtectionService } from './services/login-protection.service';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';

@Module({
  imports: [
    PassportModule,
    // Sem secret/expiresIn fixos aqui: access e refresh usam segredos e
    // validades diferentes, passados explicitamente em cada signAsync/
    // verifyAsync (ver AuthService). JwtModule so fornece o JwtService.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LoginProtectionService,
    JwtAccessStrategy,
    // Guards globais: JwtAuthGuard roda primeiro (popula request.user),
    // RolesGuard depois (le request.user.role quando a rota tem @Roles()).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
