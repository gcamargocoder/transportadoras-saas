import { Module } from '@nestjs/common';
import { FinanceAccountsModule } from '../finance-accounts/finance-accounts.module';
import { FinancialPeriodGuardModule } from '../financial-periods/financial-period-guard.module';
import { ReceivablesController } from './controllers/receivables.controller';
import { ReceivablesDashboardService } from './services/receivables-dashboard.service';
import { ReceivablesService } from './services/receivables.service';

@Module({
  // Fase 76 -- FinancialPeriodGuardService usado por ReceivablesService para
  // bloquear mutacoes em periodo fechado (ver financial-period-guard.module.ts).
  // Fase 79 -- FinanceAccountsModule (FinancialAccountsService) usado para
  // validar a conta financeira do recebimento (existe/tenant/ativa).
  imports: [FinancialPeriodGuardModule, FinanceAccountsModule],
  controllers: [ReceivablesController],
  providers: [ReceivablesService, ReceivablesDashboardService],
  // ReceivablesDashboardService exportado a partir da Fase 74 -- reaproveitado
  // por CashFlowService (nenhuma consulta nova, mesma agregacao ja existente).
  exports: [ReceivablesService, ReceivablesDashboardService],
})
export class ReceivablesModule {}
