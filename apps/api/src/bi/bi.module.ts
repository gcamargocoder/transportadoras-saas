import { Module } from '@nestjs/common';
import { FleetOperationsModule } from '../fleet-operations/fleet-operations.module';
import { BiKpisController } from './controllers/bi-kpis.controller';
import { BiKpiEvidenceService } from './services/bi-kpi-evidence.service';
import { BiKpiSnapshotService } from './services/bi-kpi-snapshot.service';
import { BiKpisService } from './services/bi-kpis.service';

// BI 1 -- fundacao dos indicadores. Importa FleetOperationsModule para
// reaproveitar os nucleos de custo/receita/tempo de frota ja existentes
// (nunca recalcula nada em paralelo). Exporta BiKpisService para os
// proximos modulos do BI consumirem a mesma fonte oficial.
@Module({
  imports: [FleetOperationsModule],
  controllers: [BiKpisController],
  providers: [BiKpisService, BiKpiSnapshotService, BiKpiEvidenceService],
  exports: [BiKpisService],
})
export class BiModule {}
