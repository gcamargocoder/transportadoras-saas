import { ApiProperty } from '@nestjs/swagger';

// GET /finance/bank-transactions/dashboard -- secao 11 do pedido. NUNCA um
// calculo de saldo (saldo oficial continua sendo FinancialAccount +
// FinancialTransaction, ver docs/bank-reconciliation.md) -- so contagens/
// somas das PROPRIAS movimentacoes bancarias importadas.
export class BankReconciliationDashboardEntity {
  @ApiProperty()
  totalCount!: number;

  @ApiProperty()
  matchedCount!: number;

  @ApiProperty()
  pendingCount!: number;

  @ApiProperty()
  divergentCount!: number;

  @ApiProperty()
  matchedAmount!: number;

  @ApiProperty()
  pendingAmount!: number;

  @ApiProperty()
  divergentAmount!: number;
}
