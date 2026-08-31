import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from '../notifications/notifications.module';
import { TollDataController } from './controllers/toll-data.controller';
import { AnttConcessionTollDataProvider } from './providers/antt-concession-tariff.provider';
import { AnttTollDataProvider } from './providers/antt-toll-data.provider';
import { ArtespTollDataProvider } from './providers/artesp-toll-data.provider';
import { RjAgetranspTollDataProvider } from './providers/rj-agetransp-tariff.provider';
import { TollDataProviderPort } from './interfaces/normalized-toll-plaza.interface';
import { TollDataSourceService } from './services/toll-data-source.service';
import { TollDataSyncScheduler } from './services/toll-data-sync.scheduler';
import { TollDataSyncService } from './services/toll-data-sync.service';
import { TollRatesService } from './services/toll-rates.service';
import { TOLL_DATA_PROVIDERS } from './toll-data.constants';

// Fase 33 -- catalogo oficial de pedagios. Modulo isolado (mesmo padrao de
// RoutingModule): so depende de PrismaService/AuditService/ConfigService
// (globais), nenhuma dependencia de TripsModule/RoutingModule, para poder
// ser importado por eles no futuro (ex: RoutingService consumindo
// TollRatesService) sem criar ciclo.
//
// ScheduleModule.forRoot() importado aqui (nao em AppModule): e o unico
// consumidor de SchedulerRegistry nesta base de codigo ate agora (auditoria
// confirmou nenhum job/scheduler preexistente).
@Module({
  imports: [ScheduleModule.forRoot(), NotificationsModule],
  controllers: [TollDataController],
  providers: [
    AnttTollDataProvider,
    AnttConcessionTollDataProvider,
    RjAgetranspTollDataProvider,
    ArtespTollDataProvider,
    {
      provide: TOLL_DATA_PROVIDERS,
      useFactory: (
        antt: AnttTollDataProvider,
        anttTarifas: AnttConcessionTollDataProvider,
        rjAgetransp: RjAgetranspTollDataProvider,
        artesp: ArtespTollDataProvider,
      ): TollDataProviderPort[] => [antt, anttTarifas, rjAgetransp, artesp],
      inject: [AnttTollDataProvider, AnttConcessionTollDataProvider, RjAgetranspTollDataProvider, ArtespTollDataProvider],
    },
    TollDataSourceService,
    TollDataSyncService,
    TollRatesService,
    TollDataSyncScheduler,
  ],
  exports: [TollDataSyncService, TollRatesService],
})
export class TollDataModule {}
