import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TenantSettingsController } from './controllers/tenant-settings.controller';
import { TenantsController } from './controllers/tenants.controller';
import { TenantContext } from './context/tenant-context';
import { TenantGuard } from './guards/tenant.guard';
import { TenantInterceptor } from './interceptors/tenant.interceptor';
import { TenantsRepository } from './repositories/tenants.repository';
import { TenantSettingsService } from './services/tenant-settings.service';
import { TenantsService } from './services/tenants.service';

// Global para que TenantContext seja injetavel em qualquer modulo (ex:
// UsersModule) sem importar TenantsModule explicitamente -- mesmo padrao de
// PrismaModule/AuditModule. TenantGuard/TenantInterceptor sao globais por
// natureza (APP_GUARD/APP_INTERCEPTOR), independente deste @Global().
@Global()
@Module({
  controllers: [TenantsController, TenantSettingsController],
  providers: [
    TenantsService,
    TenantsRepository,
    TenantSettingsService,
    TenantContext,
    // Ordem importa: TenantGuard roda DEPOIS de JwtAuthGuard/RolesGuard
    // (registrados em AuthModule, importado antes deste modulo em
    // AppModule) -- precisa de request.user ja populado.
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
  exports: [TenantContext, TenantsService],
})
export class TenantsModule {}
