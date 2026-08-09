import { Module } from '@nestjs/common';
import { FuelSuppliesModule } from '../fuel-supplies/fuel-supplies.module';
import { RoutingModule } from '../routing/routing.module';
import { TripOperationsModule } from '../trip-operations/trip-operations.module';
import { TripsModule } from '../trips/trips.module';
import { DriverTripsController } from './controllers/driver-trips.controller';
import { DriverContext } from './context/driver-context';
import { DriverGuard } from './guards/driver.guard';
import { DriverTripsService } from './services/driver-trips.service';

// API propria do app do motorista (Fase 25). Importa TripsModule so para
// reaproveitar TripsService (maquina de estados/auditoria/metricas ja
// existente -- nunca duplicada aqui) e TripOperationsModule para os 3
// servicos de sub-recurso (paradas/eixos/localizacao), compartilhados com a
// leitura administrativa em TripsController.
@Module({
  imports: [TripsModule, TripOperationsModule, FuelSuppliesModule, RoutingModule],
  controllers: [DriverTripsController],
  providers: [DriverTripsService, DriverContext, DriverGuard],
})
export class DriverTripsModule {}
