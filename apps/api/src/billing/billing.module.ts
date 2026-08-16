import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SubscriptionsController } from './controllers/subscriptions.controller';
import { BillingDashboardService } from './services/billing-dashboard.service';
import { BillingLifecycleScheduler } from './services/billing-lifecycle.scheduler';
import { BillingLifecycleService } from './services/billing-lifecycle.service';
import { SubscriptionsService } from './services/subscriptions.service';

// Fase 50 -- modulo self-contained (mesmo padrao de checklists/tolls),
// nunca dependente de TenantsModule/TenantPlan (relacao comercial
// deliberadamente separada de modulos/limites). ScheduleModule.forRoot()
// reimportado aqui (dynamic module global:true, seguro reimportar --
// mesmo padrao ja usado em TenantsModule/TollDataModule).
@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, BillingDashboardService, BillingLifecycleService, BillingLifecycleScheduler],
})
export class BillingModule {}
