import { Module } from '@nestjs/common';
import { FinancialPeriodGuardService } from './services/financial-period-guard.service';

// Modulo enxuto, separado de FinancialPeriodsModule, para evitar dependencia
// circular: PayablesModule/ReceivablesModule importam SOMENTE este modulo
// (o guard, que so depende do PrismaService global) -- nunca o
// FinancialPeriodsModule inteiro, que por sua vez importa PayablesModule/
// ReceivablesModule/FinanceReconciliationModule para montar o resumo do
// periodo (secao 6 do pedido).
@Module({
  providers: [FinancialPeriodGuardService],
  exports: [FinancialPeriodGuardService],
})
export class FinancialPeriodGuardModule {}
