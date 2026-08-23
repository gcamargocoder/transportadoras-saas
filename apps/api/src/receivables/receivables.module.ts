import { Module } from '@nestjs/common';
import { ReceivablesController } from './controllers/receivables.controller';
import { ReceivablesDashboardService } from './services/receivables-dashboard.service';
import { ReceivablesService } from './services/receivables.service';

@Module({
  controllers: [ReceivablesController],
  providers: [ReceivablesService, ReceivablesDashboardService],
  // ReceivablesDashboardService exportado a partir da Fase 74 -- reaproveitado
  // por CashFlowService (nenhuma consulta nova, mesma agregacao ja existente).
  exports: [ReceivablesService, ReceivablesDashboardService],
})
export class ReceivablesModule {}
