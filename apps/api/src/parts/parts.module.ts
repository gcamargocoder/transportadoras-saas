import { Module } from '@nestjs/common';
import { PartsController } from './controllers/parts.controller';
import { PartsService } from './services/parts.service';

// PartsService exportado para ser injetado em MaintenancesService
// (FleetModule) -- consumo de pecas ao concluir uma OS (Fase 82/83). Mesmo
// padrao ja usado por TiresModule/FuelSuppliesModule.
@Module({
  controllers: [PartsController],
  providers: [PartsService],
  exports: [PartsService],
})
export class PartsModule {}
