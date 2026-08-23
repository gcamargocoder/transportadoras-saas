import { Module } from '@nestjs/common';
import { FinanceReconciliationModule } from '../finance-reconciliation/finance-reconciliation.module';
import { PayablesModule } from '../payables/payables.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { FinancialPeriodsController } from './controllers/financial-periods.controller';
import { FinancialPeriodGuardModule } from './financial-period-guard.module';
import { FinancialPeriodsService } from './services/financial-periods.service';

// Fase 76 -- fechamento financeiro/controle de periodo. Importa
// ReceivablesModule/PayablesModule/FinanceReconciliationModule SOMENTE para
// reaproveitar seus servicos de dashboard/conciliacao no resumo do periodo
// (secao 6/8 do pedido) -- nenhuma agregacao duplicada. FinancialPeriodGuardModule
// e o unico ponto consumido de volta por PayablesModule/ReceivablesModule
// (evita dependencia circular -- ver comentario em financial-period-guard.module.ts).
@Module({
  imports: [ReceivablesModule, PayablesModule, FinanceReconciliationModule, FinancialPeriodGuardModule],
  controllers: [FinancialPeriodsController],
  providers: [FinancialPeriodsService],
})
export class FinancialPeriodsModule {}
