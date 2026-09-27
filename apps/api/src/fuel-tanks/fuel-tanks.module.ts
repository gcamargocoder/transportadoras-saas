import { Module } from '@nestjs/common';
import { FuelTanksController } from './controllers/fuel-tanks.controller';
import { FuelTanksService } from './services/fuel-tanks.service';

@Module({
  controllers: [FuelTanksController],
  providers: [FuelTanksService],
  exports: [FuelTanksService],
})
export class FuelTanksModule {}
