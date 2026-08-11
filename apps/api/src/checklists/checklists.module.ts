import { Module } from '@nestjs/common';
import { ChecklistsController } from './controllers/checklists.controller';
import { ChecklistExecutionsService } from './services/checklist-executions.service';
import { ChecklistTemplatesService } from './services/checklist-templates.service';

// Fase 38 -- fundacao do checklist operacional. Modulo isolado (mesmo
// padrao de TollDataModule/TiresModule): so depende de PrismaService/
// AuditService/TenantContext (globais), nenhuma dependencia de
// TripsModule/FleetModule. Exporta os 2 services para o DriverTripsModule
// importar (mesmo padrao de FuelSuppliesModule) -- os endpoints
// driver/checklists/* vivem no DriverTripsController, nunca duplicados
// aqui.
@Module({
  controllers: [ChecklistsController],
  providers: [ChecklistTemplatesService, ChecklistExecutionsService],
  exports: [ChecklistTemplatesService, ChecklistExecutionsService],
})
export class ChecklistsModule {}
