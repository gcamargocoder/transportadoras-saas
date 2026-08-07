import { Module } from '@nestjs/common';
import { TripRevenuesController } from './controllers/trip-revenues.controller';
import { TripRevenuesService } from './services/trip-revenues.service';

@Module({
  controllers: [TripRevenuesController],
  providers: [TripRevenuesService],
  exports: [TripRevenuesService],
})
export class TripRevenuesModule {}
