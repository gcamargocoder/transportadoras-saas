import { ApiProperty } from '@nestjs/swagger';
import { ExpenseCategory } from '@prisma/client';

// GET /payables/dashboard -- indicadores da secao 11 do pedido.
// totalOpen = totalOverdue + totalUpcoming. cancelledCount excluido de
// todos os totais (titulo cancelado nunca compoe original/pago/em aberto).
export class PayablesDashboardSummaryEntity {
  @ApiProperty({ description: 'Soma de originalAmount dos titulos nao cancelados no escopo.' })
  totalPayable!: number;

  @ApiProperty({ description: 'Soma de paidAmount dos titulos nao cancelados no escopo.' })
  totalPaid!: number;

  @ApiProperty({ description: 'Soma do saldo (originalAmount - paidAmount) dos titulos nao pagos/nao cancelados.' })
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
export class PayablesAgingBucketEntity {
  @ApiProperty({ example: 'A vencer' })
  label!: string;

  @ApiProperty({ description: 'Soma do saldo (balance) dos titulos neste intervalo.' })
  amount!: number;

  @ApiProperty()
  count!: number;
}

// Secao 13 -- consolidado por categoria (ExpenseCategory ja existente,
// nenhum enum paralelo). Nao ha consolidacao por fornecedor: o projeto nao
// possui um model Supplier estruturado (secao 12 do pedido -- "se nao
// houver, nao criar um modulo completo de fornecedores apenas para isso").
export class PayablesByCategoryEntity {
  @ApiProperty({ enum: ExpenseCategory })
  category!: ExpenseCategory;

  @ApiProperty()
  totalPayable!: number;

  @ApiProperty()
  totalPaid!: number;

  @ApiProperty()
  balance!: number;
}

export class PayablesDashboardEntity {
  @ApiProperty({ type: PayablesDashboardSummaryEntity })
  summary!: PayablesDashboardSummaryEntity;

  @ApiProperty({ type: [PayablesAgingBucketEntity], description: 'Ordem fixa: A vencer, 1-30, 31-60, 61-90, 91+.' })
  aging!: PayablesAgingBucketEntity[];

  @ApiProperty({ type: [PayablesByCategoryEntity] })
  byCategory!: PayablesByCategoryEntity[];
}
