import { Module } from '@nestjs/common';
import { PayablesController } from './controllers/payables.controller';
import { PayablesDashboardService } from './services/payables-dashboard.service';
import { PayablesService } from './services/payables.service';

@Module({
  controllers: [PayablesController],
  providers: [PayablesService, PayablesDashboardService],
  // PayablesDashboardService exportado a partir da Fase 74 -- reaproveitado
  // por CashFlowService (nenhuma consulta nova, mesma agregacao ja existente).
  exports: [PayablesService, PayablesDashboardService],
})
export class PayablesModule {}
