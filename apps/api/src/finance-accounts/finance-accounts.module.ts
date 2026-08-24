import { Module } from '@nestjs/common';
import { FinancialPeriodGuardModule } from '../financial-periods/financial-period-guard.module';
import { FinancialAccountsController } from './controllers/financial-accounts.controller';
import { FinancialTransfersController } from './controllers/financial-transfers.controller';
import { FinancialAccountsDashboardService } from './services/financial-accounts-dashboard.service';
import { FinancialAccountsService } from './services/financial-accounts.service';
import { FinancialTransactionsService } from './services/financial-transactions.service';
import { FinancialTransfersService } from './services/financial-transfers.service';

// Fase 78 -- contas financeiras, saldos e movimentacoes manuais.
// FinancialPeriodGuardModule reaproveitado (mesmo guard das Fases 76/77)
// para bloquear movimentacoes/transferencias em periodo fechado.
@Module({
  imports: [FinancialPeriodGuardModule],
  controllers: [FinancialAccountsController, FinancialTransfersController],
  providers: [FinancialAccountsService, FinancialTransactionsService, FinancialTransfersService, FinancialAccountsDashboardService],
  exports: [FinancialAccountsService],
})
export class FinanceAccountsModule {}
