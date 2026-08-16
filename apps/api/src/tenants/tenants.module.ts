import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TenantSettingsController } from './controllers/tenant-settings.controller';
import { TenantsController } from './controllers/tenants.controller';
import { TenantContext } from './context/tenant-context';
import { TenantGuard } from './guards/tenant.guard';
import { RequireModuleGuard } from './guards/require-module.guard';
import { TenantInterceptor } from './interceptors/tenant.interceptor';
import { TenantsRepository } from './repositories/tenants.repository';
import { TenantLifecycleScheduler } from './services/tenant-lifecycle.scheduler';
import { TenantLifecycleService } from './services/tenant-lifecycle.service';
import { TenantSettingsService } from './services/tenant-settings.service';
import { TenantsService } from './services/tenants.service';

// Global para que TenantContext seja injetavel em qualquer modulo (ex:
// UsersModule) sem importar TenantsModule explicitamente -- mesmo padrao de
// PrismaModule/AuditModule. TenantGuard/TenantInterceptor sao globais por
// natureza (APP_GUARD/APP_INTERCEPTOR), independente deste @Global().
// ScheduleModule.forRoot() (Fase 49): dynamic module com global:true --
// seguro reimportar aqui mesmo ja estando em TollDataModule (Nest reusa a
// mesma instancia de SchedulerRegistry), unica forma de ligar o
// TenantLifecycleScheduler (@Cron) sem depender da ordem de import de
// outro modulo de feature.
@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [TenantsController, TenantSettingsController],
  providers: [
    TenantsService,
    TenantsRepository,
    TenantSettingsService,
    TenantContext,
    TenantLifecycleService,
    TenantLifecycleScheduler,
    // Ordem importa: TenantGuard roda DEPOIS de JwtAuthGuard/RolesGuard
    // (registrados em AuthModule, importado antes deste modulo em
    // AppModule) -- precisa de request.user ja populado. RequireModuleGuard
    // (Fase 48) roda DEPOIS de TenantGuard -- precisa de request.tenant.plan
    // ja populado.
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RequireModuleGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
  exports: [TenantContext, TenantsService],
})
export class TenantsModule {}
