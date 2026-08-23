import { ApiProperty } from '@nestjs/swagger';

// GET /receivables/dashboard -- indicadores da secao 11 do pedido.
// totalOpen = totalOverdue + totalUpcoming (mesmos titulos, dois recortes
// do mesmo saldo em aberto). cancelledCount/Amount excluidos de todos os
// totais acima (titulo cancelado nunca compoe faturado/recebido/em
// aberto).
export class ReceivablesDashboardSummaryEntity {
  @ApiProperty({ description: 'Soma de originalAmount dos titulos nao cancelados no escopo.' })
  totalInvoiced!: number;

  @ApiProperty({ description: 'Soma de receivedAmount dos titulos nao cancelados no escopo.' })
  totalReceived!: number;

  @ApiProperty({ description: 'Soma do saldo (originalAmount - receivedAmount) dos titulos nao pagos/nao cancelados.' })
  totalOpen!: number;

  @ApiProperty({ description: 'Parcela de totalOpen com dueDate no passado.' })
  totalOverdue!: number;

  @ApiProperty({ description: 'Parcela de totalOpen com dueDate ainda no futuro.' })
  totalUpcoming!: number;

  @ApiProperty()
  openCount!: number;

  @ApiProperty()
  overdueCount!: number;

  @ApiProperty()
  paidCount!: number;

  @ApiProperty()
  cancelledCount!: number;
}

// Secao 12 -- aging simples (classificacao, nunca fluxo de cobranca).
export class ReceivablesAgingBucketEntity {
  @ApiProperty({ example: 'A vencer' })
  label!: string;

  @ApiProperty({ description: 'Soma do saldo (balance) dos titulos neste intervalo.' })
  amount!: number;

  @ApiProperty()
  count!: number;
}

// Secao 13 -- consolidado por cliente (agregacao em memoria a partir de um
// unico findMany, mesmo padrao de BillingDashboardService.buildTopCustomers
// -- nunca 1 query por cliente).
export class ReceivablesByCustomerEntity {
  @ApiProperty({ format: 'uuid', nullable: true })
  customerId!: string | null;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  totalInvoiced!: number;

  @ApiProperty()
  totalReceived!: number;

  @ApiProperty()
  balance!: number;

  @ApiProperty({ description: 'Parcela de balance com dueDate no passado.' })
  overdueAmount!: number;
}

export class ReceivablesDashboardEntity {
  @ApiProperty({ type: ReceivablesDashboardSummaryEntity })
  summary!: ReceivablesDashboardSummaryEntity;

  @ApiProperty({ type: [ReceivablesAgingBucketEntity], description: 'Ordem fixa: A vencer, 1-30, 31-60, 61-90, 91+.' })
  aging!: ReceivablesAgingBucketEntity[];

  @ApiProperty({ type: [ReceivablesByCustomerEntity] })
  byCustomer!: ReceivablesByCustomerEntity[];
}
