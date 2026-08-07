import { Module } from '@nestjs/common';
import { FuelSuppliesModule } from '../fuel-supplies/fuel-supplies.module';
import { DashboardController } from './controllers/dashboard.controller';
import { DashboardService } from './services/dashboard.service';

// Importa FuelSuppliesModule para reaproveitar FuelSuppliesService.getDashboard
// (Fase 18) na secao "fleet" -- nunca recalcula consumo/custo por km do zero.
@Module({
  imports: [FuelSuppliesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
