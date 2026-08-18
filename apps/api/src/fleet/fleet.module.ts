import { Module } from '@nestjs/common';
import { FleetOperationsModule } from '../fleet-operations/fleet-operations.module';
import { FuelSuppliesModule } from '../fuel-supplies/fuel-supplies.module';
import { FleetsController } from './controllers/fleets.controller';
import { MaintenancesController } from './controllers/maintenances.controller';
import { TagProvidersController } from './controllers/tag-providers.controller';
import { TrailersController } from './controllers/trailers.controller';
import { TripCompositionsController } from './controllers/trip-compositions.controller';
import { VehiclesController } from './controllers/vehicles.controller';
import { FleetsService } from './services/fleets.service';
import { MaintenancesService } from './services/maintenances.service';
import { TagProvidersService } from './services/tag-providers.service';
import { TrailersService } from './services/trailers.service';
import { TripCompositionsService } from './services/trip-compositions.service';
import { VehicleDocumentsService } from './services/vehicle-documents.service';
import { VehicleOverviewService } from './services/vehicle-overview.service';
import { VehicleTagsService } from './services/vehicle-tags.service';
import { VehiclesService } from './services/vehicles.service';

// Fase 62 -- importa FleetOperationsModule para VehicleOverviewService
// reaproveitar FleetOperationsMetricsService.getFinancialDashboard (nunca
// recalcula receita/despesa/custo em paralelo).
@Module({
  imports: [FuelSuppliesModule, FleetOperationsModule],
  controllers: [
    FleetsController,
    VehiclesController,
    TrailersController,
    TagProvidersController,
    TripCompositionsController,
    MaintenancesController,
  ],
  providers: [
    FleetsService,
    VehiclesService,
    VehicleTagsService,
    TrailersService,
    TagProvidersService,
    TripCompositionsService,
    MaintenancesService,
    VehicleDocumentsService,
    VehicleOverviewService,
  ],
})
export class FleetModule {}
