import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { TollDataProvider } from '@prisma/client';
import { AppConfig } from '../../config/configuration';
import { TollDataSyncService } from './toll-data-sync.service';

// Fase 33, secao 10 -- auditoria confirmou que o projeto NAO tinha nenhum
// scheduler/job framework antes desta fase (nenhum @nestjs/schedule, cron,
// bullmq...); instala a solucao minima oficial do proprio ecossistema Nest
// (@nestjs/schedule), nunca um framework de filas completo para uma
// sincronizacao diaria simples. Registro DINAMICO (via SchedulerRegistry,
// nao @Cron() estatico) porque a expressao/o liga-desliga vem de env var
// (TOLL_DATA_SYNC_ENABLED/TOLL_DATA_SYNC_CRON), avaliada em runtime.
@Injectable()
export class TollDataSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(TollDataSyncScheduler.name);
  private static readonly JOB_NAME = 'toll-data-sync';

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly syncService: TollDataSyncService,
  ) {}

  onModuleInit(): void {
    const config = this.configService.get('tollDataSync', { infer: true });
    if (!config.enabled) {
      this.logger.log('Sincronizacao automatica de dados de pedagio DESABILITADA (TOLL_DATA_SYNC_ENABLED=false).');
      return;
    }

    const job = new CronJob(config.cronExpression, () => {
      void this.runScheduledSync();
    });
    this.schedulerRegistry.addCronJob(TollDataSyncScheduler.JOB_NAME, job);
    job.start();
    this.logger.log(`Sincronizacao automatica de dados de pedagio agendada (cron: "${config.cronExpression}").`);
  }

  // Sincroniza todos os providers conhecidos, um apos o outro -- nunca em
  // paralelo (evita concorrencia de escrita sobre o mesmo TollPlaza global).
  // Falha de UM provider nunca impede a tentativa dos demais.
  private async runScheduledSync(): Promise<void> {
    for (const provider of [
      TollDataProvider.ANTT,
      TollDataProvider.ANTT_TARIFAS,
      TollDataProvider.RJ_AGETRANSP,
      TollDataProvider.ARTESP,
    ]) {
      try {
        const outcome = await this.syncService.sync(provider, 'scheduler');
        this.logger.log(
          `Sincronizacao agendada ${provider}: ${outcome.status} ` +
            `(lidos=${outcome.recordsRead}, criados=${outcome.recordsCreated}, ` +
            `atualizados=${outcome.recordsUpdated}, inalterados=${outcome.recordsUnchanged}, ` +
            `rejeitados=${outcome.recordsRejected}).`,
        );
      } catch (error) {
        this.logger.error(
          `Sincronizacao agendada ${provider} falhou inesperadamente: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }
}
