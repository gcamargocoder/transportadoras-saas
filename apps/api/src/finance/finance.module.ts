import { Module } from '@nestjs/common';
import { PayablesModule } from '../payables/payables.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { FinanceController } from './controllers/finance.controller';
import { CashFlowService } from './services/cash-flow.service';

// Fase 74 -- consolida ReceivablesDashboardService/PayablesDashboardService
// (importados via seus proprios modulos, nunca reimplementados aqui).
@Module({
  imports: [ReceivablesModule, PayablesModule],
  controllers: [FinanceController],
  providers: [CashFlowService],
})
export class FinanceModule {}
