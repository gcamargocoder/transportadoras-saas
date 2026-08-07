import { Module } from '@nestjs/common';
import { TripExpensesController } from './controllers/trip-expenses.controller';
import { TripExpensesService } from './services/trip-expenses.service';

// TripExpensesService e exportado para ser injetado no TripsController
// (rotas GET /trips/:id/expenses e GET /trips/:id/financial-summary,
// definidas ali por serem sub-recursos de Trip -- mesmo padrao ja usado
// para timeline/summary/metrics/route-events naquele controller).
@Module({
  controllers: [TripExpensesController],
  providers: [TripExpensesService],
  exports: [TripExpensesService],
})
export class TripExpensesModule {}
