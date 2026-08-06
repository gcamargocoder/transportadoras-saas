import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
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
})
export class AppModule {}
