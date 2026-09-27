import { Module } from '@nestjs/common';
import { FuelTanksModule } from '../fuel-tanks/fuel-tanks.module';
import { FuelSuppliesController } from './controllers/fuel-supplies.controller';
import { FuelSuppliesService } from './services/fuel-supplies.service';

// FuelSuppliesService e exportado para ser injetado no VehiclesController
// (rota GET /vehicles/:id/fuel-history, sub-recurso de Vehicle) -- mesmo
// padrao ja usado por TripExpensesService em TripsController. FuelTanksModule
// (Gestao de Combustivel, Fase 3) -- abastecimento interno chama
// FuelTanksService.registerInternalFueling dentro da propria transacao.
@Module({
  imports: [FuelTanksModule],
  controllers: [FuelSuppliesController],
  providers: [FuelSuppliesService],
  exports: [FuelSuppliesService],
})
export class FuelSuppliesModule {}
