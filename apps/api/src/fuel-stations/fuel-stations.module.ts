import { Module } from '@nestjs/common';
import { FuelStationsController } from './controllers/fuel-stations.controller';
import { FuelStationsService } from './services/fuel-stations.service';

@Module({
  controllers: [FuelStationsController],
  providers: [FuelStationsService],
  exports: [FuelStationsService],
})
export class FuelStationsModule {}
