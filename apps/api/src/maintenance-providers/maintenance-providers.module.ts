import { Module } from '@nestjs/common';
import { MaintenanceProvidersController } from './controllers/maintenance-providers.controller';
import { MaintenanceProvidersService } from './services/maintenance-providers.service';

// MaintenanceProvidersService exportado para ser injetado em
// MaintenancesService (FleetModule) -- validacao de workshopId/supplierId
// ao criar/atualizar uma OS. Mesmo padrao de PartsModule (Fase 83).
@Module({
  controllers: [MaintenanceProvidersController],
  providers: [MaintenanceProvidersService],
  exports: [MaintenanceProvidersService],
})
export class MaintenanceProvidersModule {}
