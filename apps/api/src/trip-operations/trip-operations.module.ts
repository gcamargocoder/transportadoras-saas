import { Module } from '@nestjs/common';
import { RoutingModule } from '../routing/routing.module';
import { DeliveryOccurrencesController } from './controllers/delivery-occurrences.controller';
import { TripStopsController } from './controllers/trip-stops.controller';
import { AxleEventsService } from './services/axle-events.service';
import { DriverShiftsService } from './services/driver-shifts.service';
import { TrackingPointsService } from './services/tracking-points.service';
import { TripOccurrencesService } from './services/trip-occurrences.service';
import { TripStopsService } from './services/trip-stops.service';

// Ate a Fase 43, modulo sem controllers proprios (Fase 25): expunha so os 3
// services que tanto o TripsController (leitura administrativa) quanto o
// DriverTripsController (escrita pelo app do motorista) consomem. Fica
// separado de TripsModule e de DriverTripsModule para evitar dependencia
// circular entre os dois -- nenhum dos dois servicos aqui precisa de
// TripsService.
//
// Fase 43 adiciona TripStopsController (rotas /trip-stops, gestao
// administrativa cross-frota) -- unico controller proprio deste modulo, sem
// afetar o desenho de dependencia unidirecional acima.
//
// Importa RoutingModule (Fase 26) so para TrackingPointsService acionar a
// deteccao de desvio a cada lote de localizacao -- RoutingModule nao
// depende deste modulo de volta, sem ciclo (mesmo desenho de dependencia
// unidirecional ja usado no projeto).
// Fase 67 -- TripOccurrencesService/DriverShiftsService seguem o MESMO
// desenho dos 3 services acima (so PrismaService/AuditService, nenhuma
// dependencia de TripsService, para nao correr risco de ciclo).
@Module({
  imports: [RoutingModule],
  controllers: [TripStopsController, DeliveryOccurrencesController],
  providers: [TripStopsService, AxleEventsService, TrackingPointsService, TripOccurrencesService, DriverShiftsService],
  exports: [TripStopsService, AxleEventsService, TrackingPointsService, TripOccurrencesService, DriverShiftsService],
})
export class TripOperationsModule {}
