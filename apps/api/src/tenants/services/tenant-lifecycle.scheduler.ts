import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TenantLifecycleService } from './tenant-lifecycle.service';

// Fase 49 -- job diario simples (decorator estatico @Cron, sem
// configuracao dinamica via env var: nao ha necessidade de expressao/
// liga-desliga configuravel aqui, diferente do TollDataSyncScheduler, que
// precisa disso para sincronizacoes externas). Uma execucao diaria e
// suficiente -- nunca polling agressivo.
@Injectable()
export class TenantLifecycleScheduler {
  private readonly logger = new Logger(TenantLifecycleScheduler.name);

  constructor(private readonly lifecycleService: TenantLifecycleService) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM, { name: 'tenant-trial-expiry' })
  async handleTrialExpiry(): Promise<void> {
    try {
      const count = await this.lifecycleService.expireOverdueTrials();
      if (count > 0) {
        this.logger.log(`Execucao agendada: ${count} tenant(s) transicionado(s) de TRIAL para EXPIRED.`);
      }
    } catch (error) {
      this.logger.error(
        `Execucao agendada de expiracao de trial falhou inesperadamente: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
