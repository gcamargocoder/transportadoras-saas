import { ApiProperty } from '@nestjs/swagger';

// Resumo calculado AO VIVO a partir dos ledgers ja existentes (Receivable/
// Payable) e da conciliacao (Fase 75) -- nunca persistido, mesmo espirito
// de CashFlowEntity/FinanceReconciliationEntity. O fechamento (secao 8 do
// pedido) so guarda o status do periodo, nunca este snapshot. Reaproveita
// ReceivablesDashboardService/PayablesDashboardService/
// FinanceReconciliationService filtrados pelo mes (issueDate do titulo
// dentro do periodo) -- mesmo criterio ja usado pelos dashboards
// existentes, nenhuma agregacao nova.
export class FinancialPeriodSummaryEntity {
  @ApiProperty({ description: 'Soma de receivedAmount dos titulos com issueDate no periodo (ReceivablesDashboardService).' })
  totalReceived!: number;

  @ApiProperty({ description: 'Soma de paidAmount dos titulos com issueDate no periodo (PayablesDashboardService).' })
  totalPaid!: number;

  @ApiProperty({ description: 'Saldo em aberto de contas a receber com issueDate no periodo.' })
  receivableOpen!: number;

  @ApiProperty({ description: 'Saldo em aberto de contas a pagar com issueDate no periodo.' })
  payableOpen!: number;

  @ApiProperty({ description: 'Inconsistencias CRITICAL detectadas pela conciliacao (Fase 75) no escopo do periodo.' })
  criticalReconciliationIssues!: number;
}
