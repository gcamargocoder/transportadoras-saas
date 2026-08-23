import { Module } from '@nestjs/common';
import { FinancialPeriodGuardModule } from '../financial-periods/financial-period-guard.module';
import { ReceivablesController } from './controllers/receivables.controller';
import { ReceivablesDashboardService } from './services/receivables-dashboard.service';
import { ReceivablesService } from './services/receivables.service';

@Module({
  // Fase 76 -- FinancialPeriodGuardService usado por ReceivablesService para
  // bloquear mutacoes em periodo fechado (ver financial-period-guard.module.ts).
  imports: [FinancialPeriodGuardModule],
  controllers: [ReceivablesController],
  providers: [ReceivablesService, ReceivablesDashboardService],
  // ReceivablesDashboardService exportado a partir da Fase 74 -- reaproveitado
  // por CashFlowService (nenhuma consulta nova, mesma agregacao ja existente).
  exports: [ReceivablesService, ReceivablesDashboardService],
})
export class ReceivablesModule {}
