import { Module } from '@nestjs/common';
import { FinancialPeriodGuardModule } from '../financial-periods/financial-period-guard.module';
import { BankTransactionsController } from './controllers/bank-transactions.controller';
import { BankTransactionsImportController } from './controllers/bank-transactions-import.controller';
import { BankReconciliationDashboardService } from './services/bank-reconciliation-dashboard.service';
import { BankTransactionsImportService } from './services/bank-transactions-import.service';
import { BankTransactionsService } from './services/bank-transactions.service';

// Fase 80 -- conciliacao bancaria. FinancialPeriodGuardModule reaproveitado
// (mesmo guard das Fases 76-79) para bloquear reconcile/unreconcile em
// periodo fechado.
@Module({
  imports: [FinancialPeriodGuardModule],
  controllers: [BankTransactionsController, BankTransactionsImportController],
  providers: [BankTransactionsService, BankTransactionsImportService, BankReconciliationDashboardService],
})
export class BankReconciliationModule {}
