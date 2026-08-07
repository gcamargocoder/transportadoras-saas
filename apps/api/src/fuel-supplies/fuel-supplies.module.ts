import { Module } from '@nestjs/common';
import { FuelSuppliesController } from './controllers/fuel-supplies.controller';
import { FuelSuppliesService } from './services/fuel-supplies.service';

// FuelSuppliesService e exportado para ser injetado no VehiclesController
// (rota GET /vehicles/:id/fuel-history, sub-recurso de Vehicle) -- mesmo
// padrao ja usado por TripExpensesService em TripsController.
@Module({
  controllers: [FuelSuppliesController],
  providers: [FuelSuppliesService],
  exports: [FuelSuppliesService],
})
export class FuelSuppliesModule {}
