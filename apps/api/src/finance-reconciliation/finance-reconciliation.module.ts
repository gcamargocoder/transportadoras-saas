import { Module } from '@nestjs/common';
import { FinanceReconciliationController } from './controllers/finance-reconciliation.controller';
import { FinanceReconciliationService } from './services/finance-reconciliation.service';

@Module({
  controllers: [FinanceReconciliationController],
  providers: [FinanceReconciliationService],
  // Exportado a partir da Fase 76 -- reaproveitado por FinancialPeriodsService
  // para checar inconsistencias CRITICAL antes de fechar um periodo (nenhuma
  // logica de deteccao duplicada).
  exports: [FinanceReconciliationService],
})
export class FinanceReconciliationModule {}
