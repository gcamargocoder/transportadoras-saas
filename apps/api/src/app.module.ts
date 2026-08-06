import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { buildThrottlerOptions } from './common/config/throttler.config';
import { AppConfig } from './config/configuration';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { DriversModule } from './drivers/drivers.module';
import { FleetModule } from './fleet/fleet.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { TenantsModule } from './tenants/tenants.module';
import { TripsModule } from './trips/trips.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
    // Rate limiting global (ver common/constants/throttle.constants.ts para
    // limites especificos por rota via @Throttle(...)). Registrado antes dos
    // demais modulos de proposito: o ThrottlerGuard deve rodar antes de
    // JwtAuthGuard/RolesGuard/TenantGuard, rejeitando excesso de requisicoes
    // sem gastar trabalho de autenticacao/isolamento por tenant.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) =>
        buildThrottlerOptions(configService),
    }),
    PrismaModule,
    AuditModule,
    CommonModule,
    HealthModule,
    // Ordem importa para os guards/interceptors globais (APP_GUARD/
    // APP_INTERCEPTOR): AuthModule (JwtAuthGuard, RolesGuard) precisa rodar
    // antes de TenantsModule (TenantGuard), que depende de request.user ja
    // populado.
    AuthModule,
    TenantsModule,
    UsersModule,
    DriversModule,
    FleetModule,
    TripsModule,
    // Modulos de negocio (pedagios...) serao registrados aqui conforme
    // forem implementados.
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
