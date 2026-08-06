import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TenantsController } from './controllers/tenants.controller';
import { TenantContext } from './context/tenant-context';
import { TenantGuard } from './guards/tenant.guard';
import { TenantInterceptor } from './interceptors/tenant.interceptor';
import { TenantsService } from './services/tenants.service';

// Global para que TenantContext seja injetavel em qualquer modulo (ex:
// UsersModule) sem importar TenantsModule explicitamente -- mesmo padrao de
// PrismaModule/AuditModule. TenantGuard/TenantInterceptor sao globais por
// natureza (APP_GUARD/APP_INTERCEPTOR), independente deste @Global().
@Global()
@Module({
  controllers: [TenantsController],
  providers: [
    TenantsService,
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
