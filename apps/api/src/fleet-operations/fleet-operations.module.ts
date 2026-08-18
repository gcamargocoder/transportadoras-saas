import { Module } from '@nestjs/common';
import { FuelSuppliesModule } from '../fuel-supplies/fuel-supplies.module';
import { TiresModule } from '../tires/tires.module';
import { FleetOperationsController } from './controllers/fleet-operations.controller';
import { FleetOperationsMetricsService } from './services/fleet-operations-metrics.service';

// Importa FuelSuppliesModule/TiresModule para reaproveitar seus
// getDashboard() ja existentes no dashboard consolidado (Fase 40) -- mesmo
// padrao ja usado por DashboardModule.
@Module({
  imports: [FuelSuppliesModule, TiresModule],
  controllers: [FleetOperationsController],
  providers: [FleetOperationsMetricsService],
  // Fase 62 -- exportado para VehicleOverviewService (FleetModule)
  // reaproveitar getFinancialDashboard sem recalcular custo/receita.
  exports: [FleetOperationsMetricsService],
})
export class FleetOperationsModule {}
