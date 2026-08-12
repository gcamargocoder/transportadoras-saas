import { Module } from '@nestjs/common';
import { TiresController } from './controllers/tires.controller';
import { TiresService } from './services/tires.service';

// TiresService exportado para ser injetado em FleetOperationsMetricsService
// (Fase 40, reaproveita getDashboard() ja existente no dashboard consolidado
// de frota) -- mesmo padrao ja usado por FuelSuppliesModule.
@Module({
  controllers: [TiresController],
  providers: [TiresService],
  exports: [TiresService],
})
export class TiresModule {}
