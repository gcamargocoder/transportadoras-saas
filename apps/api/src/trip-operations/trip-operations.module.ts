import { Module } from '@nestjs/common';
import { RoutingModule } from '../routing/routing.module';
import { AxleEventsService } from './services/axle-events.service';
import { TrackingPointsService } from './services/tracking-points.service';
import { TripStopsService } from './services/trip-stops.service';

// Modulo sem controllers proprios (Fase 25): expoe os 3 services que tanto o
// TripsController (leitura administrativa) quanto o DriverTripsController
// (escrita pelo app do motorista) consomem. Fica separado de TripsModule e
// de DriverTripsModule para evitar dependencia circular entre os dois --
// nenhum dos dois servicos aqui precisa de TripsService.
//
// Importa RoutingModule (Fase 26) so para TrackingPointsService acionar a
// deteccao de desvio a cada lote de localizacao -- RoutingModule nao
// depende deste modulo de volta, sem ciclo (mesmo desenho de dependencia
// unidirecional ja usado no projeto).
@Module({
  imports: [RoutingModule],
  providers: [TripStopsService, AxleEventsService, TrackingPointsService],
  exports: [TripStopsService, AxleEventsService, TrackingPointsService],
})
export class TripOperationsModule {}
