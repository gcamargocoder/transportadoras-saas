import { Module } from '@nestjs/common';
import { RoutingModule } from '../routing/routing.module';
import { TripStopsController } from './controllers/trip-stops.controller';
import { AxleEventsService } from './services/axle-events.service';
import { TrackingPointsService } from './services/tracking-points.service';
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
@Module({
  imports: [RoutingModule],
  controllers: [TripStopsController],
  providers: [TripStopsService, AxleEventsService, TrackingPointsService],
  exports: [TripStopsService, AxleEventsService, TrackingPointsService],
})
export class TripOperationsModule {}
