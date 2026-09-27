import { Module } from '@nestjs/common';
import { FleetOperationsModule } from '../fleet-operations/fleet-operations.module';
import { BiAlertsController } from './controllers/bi-alerts.controller';
import { BiKpisController } from './controllers/bi-kpis.controller';
import { BiAlertsService } from './services/bi-alerts.service';
import { BiKpiBreakdownService } from './services/bi-kpi-breakdown.service';
import { BiKpiEvidenceService } from './services/bi-kpi-evidence.service';
import { BiKpiSeriesService } from './services/bi-kpi-series.service';
import { BiKpiSnapshotService } from './services/bi-kpi-snapshot.service';
import { BiKpisService } from './services/bi-kpis.service';

// BI 1 -- fundacao dos indicadores. Importa FleetOperationsModule para
// reaproveitar os nucleos de custo/receita/tempo de frota ja existentes
// (nunca recalcula nada em paralelo). Exporta BiKpisService para os
// proximos modulos do BI consumirem a mesma fonte oficial.
// BI 10 -- BiAlertsService so depende de BiKpisService (getSummary/
// getSeries): nenhum acesso direto ao Prisma, nenhuma segunda fonte.
@Module({
  imports: [FleetOperationsModule],
  controllers: [BiKpisController, BiAlertsController],
  providers: [BiKpisService, BiKpiSnapshotService, BiKpiEvidenceService, BiKpiSeriesService, BiKpiBreakdownService, BiAlertsService],
  exports: [BiKpisService],
})
export class BiModule {}
