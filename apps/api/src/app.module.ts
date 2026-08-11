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
import { DashboardModule } from './dashboard/dashboard.module';
import { DriverTripsModule } from './driver-trips/driver-trips.module';
import { DriversModule } from './drivers/drivers.module';
import { FleetModule } from './fleet/fleet.module';
import { FuelStationsModule } from './fuel-stations/fuel-stations.module';
import { FuelSuppliesModule } from './fuel-supplies/fuel-supplies.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RoutingModule } from './routing/routing.module';
import { TenantsModule } from './tenants/tenants.module';
import { TollImportModule } from './toll-import/toll-import.module';
import { TollRoutesModule } from './toll-routes/toll-routes.module';
import { TollsModule } from './tolls/tolls.module';
import { TripAdvancesModule } from './trip-advances/trip-advances.module';
import { TripExpensesModule } from './trip-expenses/trip-expenses.module';
import { TripRevenuesModule } from './trip-revenues/trip-revenues.module';
import { TiresModule } from './tires/tires.module';
import { TollDataModule } from './toll-data/toll-data.module';
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
    TollsModule,
    TollImportModule,
    TollRoutesModule,
    TripExpensesModule,
    TripRevenuesModule,
    TripAdvancesModule,
    FuelStationsModule,
    FuelSuppliesModule,
    DashboardModule,
    TiresModule,
    RoutingModule,
    DriverTripsModule,
    TollDataModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
