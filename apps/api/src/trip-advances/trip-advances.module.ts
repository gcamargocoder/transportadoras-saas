import { Module } from '@nestjs/common';
import { TripAdvancesController } from './controllers/trip-advances.controller';
import { TripAdvancesService } from './services/trip-advances.service';

@Module({
  controllers: [TripAdvancesController],
  providers: [TripAdvancesService],
  exports: [TripAdvancesService],
})
export class TripAdvancesModule {}
