import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { AppConfig } from '../../config/configuration';
import { NotificationsService } from './notifications.service';

// Fase 70 -- tira a geracao de notificacoes do caminho sincrono de
// GET /notifications/unread-count (Fase 69). Mesmo padrao EXATO de
// TollDataSyncScheduler (unico precedente de job configuravel por env var
// no projeto -- auditoria confirmou @nestjs/schedule ja instalado e em uso
// por 3 schedulers): registro DINAMICO via SchedulerRegistry (nao @Cron()
// estatico) porque a expressao/o liga-desliga vem de env var
// (NOTIFICATIONS_PROCESS_ENABLED/NOTIFICATIONS_PROCESS_CRON), avaliada em
// runtime. Ligado por padrao (diferente de TollDataSyncScheduler): nunca
// faz chamada de rede externa, so leitura/escrita interna idempotente.
@Injectable()
export class NotificationsProcessingScheduler implements OnModuleInit {
  private readonly logger = new Logger(NotificationsProcessingScheduler.name);
  private static readonly JOB_NAME = 'notifications-processing';

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit(): void {
    const config = this.configService.get('notificationsProcessing', { infer: true });
    if (!config.enabled) {
      this.logger.log('Processamento periodico de notificacoes DESABILITADO (NOTIFICATIONS_PROCESS_ENABLED=false).');
      return;
    }

    const job = new CronJob(config.cronExpression, () => {
      void this.runScheduledProcessing();
    });
    this.schedulerRegistry.addCronJob(NotificationsProcessingScheduler.JOB_NAME, job);
    job.start();
    this.logger.log(`Processamento periodico de notificacoes agendado (cron: "${config.cronExpression}").`);
  }

  // Idempotente por construcao (NotificationsService.processAllTenants ->
  // processTenant -> createMany skipDuplicates): uma execucao atrasada que
  // se sobrepoe a proxima nunca duplica, o unique constraint do banco e a
  // barreira final.
  private async runScheduledProcessing(): Promise<void> {
    try {
      const result = await this.notificationsService.processAllTenants();
      if (result.notificationsCreated > 0) {
        this.logger.log(
          `Execucao agendada: ${result.notificationsCreated} notificacao(oes) criada(s) em ${result.tenantsProcessed} tenant(s) processado(s).`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Execucao agendada de processamento de notificacoes falhou inesperadamente: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
