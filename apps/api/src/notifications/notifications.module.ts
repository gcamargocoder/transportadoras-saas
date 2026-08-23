import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationsProcessingScheduler } from './services/notifications-processing.scheduler';
import { NotificationsService } from './services/notifications.service';

// Fase 69 -- Centro de Alertas e Notificacoes. So PrismaService/AuditService
// como dependencia (mesmo desenho de TripOccurrencesService na Fase 67) --
// exportado para o DriverTripsModule reaproveitar o MESMO service nos
// endpoints GET/PATCH driver/notifications/*, nunca um segundo service.
//
// Fase 70 -- ScheduleModule.forRoot() importado aqui (mesmo padrao ja usado
// em TollDataModule/TenantsModule/BillingModule -- dynamic module global,
// seguro reimportar em varios modulos) para o
// NotificationsProcessingScheduler poder usar SchedulerRegistry.
@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsProcessingScheduler],
  exports: [NotificationsService],
})
export class NotificationsModule {}
