import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillingLifecycleService } from './billing-lifecycle.service';

// Fase 50 -- mesmo padrao exato de TenantLifecycleScheduler (Fase 49):
// job diario simples, decorator estatico @Cron (reaproveita o
// ScheduleModule.forRoot() ja global, registrado em TenantsModule).
@Injectable()
export class BillingLifecycleScheduler {
  private readonly logger = new Logger(BillingLifecycleScheduler.name);

  constructor(private readonly lifecycleService: BillingLifecycleService) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM, { name: 'billing-overdue-check' })
  async handleOverdueCheck(): Promise<void> {
    try {
      const count = await this.lifecycleService.markOverdueSubscriptions();
      if (count > 0) {
        this.logger.log(`Execucao agendada: ${count} assinatura(s) marcada(s) como OVERDUE.`);
      }
    } catch (error) {
      this.logger.error(
        `Execucao agendada de verificacao de inadimplencia falhou inesperadamente: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
