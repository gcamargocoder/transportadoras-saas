import { Module } from '@nestjs/common';
import { RoutingModule } from '../routing/routing.module';
import { TollRoutesModule } from '../toll-routes/toll-routes.module';
import { TripOperationsModule } from '../trip-operations/trip-operations.module';
import { TripExpensesModule } from '../trip-expenses/trip-expenses.module';
import { TripSettlementsModule } from '../trip-settlements/trip-settlements.module';
import { VehicleIdlePeriodsModule } from '../vehicle-idle-periods/vehicle-idle-periods.module';
import { CustomersController } from './controllers/customers.controller';
import { DeliveryStopsController } from './controllers/delivery-stops.controller';
import { LocationsController } from './controllers/locations.controller';
import { TripsController } from './controllers/trips.controller';
import { CustomerContactsService } from './services/customer-contacts.service';
import { CustomerNotesService } from './services/customer-notes.service';
import { CustomersService } from './services/customers.service';
import { EmptyTripsService } from './services/empty-trips.service';
import { FleetOptimizationService } from './services/fleet-optimization.service';
import { LocationsService } from './services/locations.service';
import { RouteEventsService } from './services/route-events.service';
import { RouteVersionsService } from './services/route-versions.service';
import { TripDeliveryStopsService } from './services/trip-delivery-stops.service';
import { TripEtaService } from './services/trip-eta.service';
import { TripMetricsService } from './services/trip-metrics.service';
import { TripReturnConsolidationService } from './services/trip-return-consolidation.service';
import { TripRoutingService } from './services/trip-routing.service';
import { TripTimelineService } from './services/trip-timeline.service';
import { TripsService } from './services/trips.service';

// RoutingModule (Fase 26) importado aqui so para TripRoutingService (Fase
// 89) reaproveitar RoutingService.isProviderConfigured() -- mesmo padrao ja
// usado por TripOperationsModule (Fase 25) para TrackingPointsService
// acionar deteccao de desvio; nenhuma dependencia circular (RoutingModule
// nunca importa TripsModule).
@Module({
  imports: [
    TripExpensesModule,
    TripSettlementsModule,
    TollRoutesModule,
    TripOperationsModule,
    RoutingModule,
    // Fase B -- abertura/fechamento AUTOMATICO de VehicleIdlePeriod na
    // MESMA transacao da transicao de status da viagem (updateStatus).
    VehicleIdlePeriodsModule,
  ],
  controllers: [TripsController, CustomersController, LocationsController, DeliveryStopsController],
  providers: [
    TripsService,
    RouteVersionsService,
    RouteEventsService,
    TripDeliveryStopsService,
    TripRoutingService,
    TripEtaService,
    FleetOptimizationService,
    EmptyTripsService,
    TripMetricsService,
    // Fase E -- consolidacao DERIVADA ida -> retorno (somente leitura),
    // reaproveita TripSettlementsService.getFinancialResult por perna.
    TripReturnConsolidationService,
    TripTimelineService,
    CustomersService,
    CustomerContactsService,
    CustomerNotesService,
    LocationsService,
  ],
  // TripsService e exportado para ser reaproveitado pelo DriverTripsModule
  // (Fase 25) -- a API do app do motorista delega toda transicao de estado
  // (start/pause/resume/complete) para o MESMO motor/maquina de estados,
  // nunca duplica a logica. TripDeliveryStopsService (Fase 88) e exportado
  // pelo mesmo motivo -- o Driver App expoe LEITURA das paradas planejadas
  // (ver DriverTripsController.findDeliveryStops), reaproveitando o mesmo
  // service administrativo, nunca uma segunda consulta paralela. A LEITURA
  // da sequencia roteirizada (Fase 89) ja e coberta pelo MESMO endpoint --
  // aplicar uma sugestao apenas reordena TripDeliveryStop.sequence, entao
  // TripRoutingService nao precisa ser exportado/consumido pelo Driver App.
  // TripEtaService (Fase 91) E exportado -- o Driver App expoe a MESMA
  // previsao calculada (ver DriverTripsController), nunca um segundo motor
  // de ETA paralelo.
  exports: [TripsService, TripDeliveryStopsService, TripEtaService],
})
export class TripsModule {}
