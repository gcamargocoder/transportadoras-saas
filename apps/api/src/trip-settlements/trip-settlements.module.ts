import { Module } from '@nestjs/common';
import { TripSettlementsService } from './services/trip-settlements.service';

// Sem controller proprio: GET/POST /trips/:id/settlement... e
// GET /trips/:id/financial-dashboard sao sub-recursos de Trip, expostos em
// TripsController (mesmo padrao ja usado para despesas -- ver
// trip-expenses.module.ts). TripSettlementsService e exportado para essa
// injecao cross-module.
@Module({
  providers: [TripSettlementsService],
  exports: [TripSettlementsService],
})
export class TripSettlementsModule {}
