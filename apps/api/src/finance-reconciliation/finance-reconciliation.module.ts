import { Module } from '@nestjs/common';
import { FinanceReconciliationController } from './controllers/finance-reconciliation.controller';
import { FinanceReconciliationService } from './services/finance-reconciliation.service';

@Module({
  controllers: [FinanceReconciliationController],
  providers: [FinanceReconciliationService],
})
export class FinanceReconciliationModule {}
