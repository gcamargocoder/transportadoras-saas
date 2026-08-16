import { Module } from '@nestjs/common';
import { MaintenancePlansController } from './controllers/maintenance-plans.controller';
import { MaintenancePlansService } from './services/maintenance-plans.service';

// Fase 45 -- planos de manutencao preventiva (MaintenancePlan). Os
// registros de manutencao em si (records) continuam no FleetModule
// (MaintenancesService, ja existente desde a Fase 12/13) -- nao duplicados
// aqui. FleetOperationsMetricsService consome MaintenancePlan diretamente
// via PrismaService (mesmo padrao ja usado para todos os outros dominios
// do dashboard), sem depender deste modulo.
@Module({
  controllers: [MaintenancePlansController],
  providers: [MaintenancePlansService],
  exports: [MaintenancePlansService],
})
export class MaintenanceModule {}
