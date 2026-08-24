import { Module } from '@nestjs/common';
import { FinanceAccountsModule } from '../finance-accounts/finance-accounts.module';
import { FinancialPeriodGuardModule } from '../financial-periods/financial-period-guard.module';
import { PayablesController } from './controllers/payables.controller';
import { PayablesDashboardService } from './services/payables-dashboard.service';
import { PayablesService } from './services/payables.service';

@Module({
  // Fase 76 -- FinancialPeriodGuardService usado por PayablesService para
  // bloquear mutacoes em periodo fechado (ver financial-period-guard.module.ts).
  // Fase 79 -- FinanceAccountsModule (FinancialAccountsService) usado para
  // validar a conta financeira do pagamento (existe/tenant/ativa).
  imports: [FinancialPeriodGuardModule, FinanceAccountsModule],
  controllers: [PayablesController],
  providers: [PayablesService, PayablesDashboardService],
  // PayablesDashboardService exportado a partir da Fase 74 -- reaproveitado
  // por CashFlowService (nenhuma consulta nova, mesma agregacao ja existente).
  exports: [PayablesService, PayablesDashboardService],
})
export class PayablesModule {}
