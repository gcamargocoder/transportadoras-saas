import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpensePaymentMethod } from '@prisma/client';

// Linha do ledger imutavel de pagamentos (ver PayablePayment no schema) --
// nunca editada/apagada apos criada.
export class PayablePaymentEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  payableId!: string;

  @ApiProperty()
  amount!: number;

  @ApiProperty()
  paymentDate!: Date;

  @ApiProperty({ enum: ExpensePaymentMethod })
  paymentMethod!: ExpensePaymentMethod;

  @ApiPropertyOptional({ nullable: true, description: 'Juros pagos alem do valor do titulo -- nao abate o saldo.' })
  interestAmount!: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Multa paga alem do valor do titulo -- nao abate o saldo.' })
  fineAmount!: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Desconto concedido -- abate o saldo junto com amount, mas nao movimenta caixa.' })
  discountAmount!: number | null;

  @ApiPropertyOptional({ nullable: true })
  reference!: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  // Fase 79 -- nullable pois pagamentos anteriores a esta fase nunca
  // tiveram conta financeira vinculada (ver docs/financial-payment-integration.md).
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  financialAccountId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  financialAccountName!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'FinancialTransaction (DEBIT) gerada por este pagamento.' })
  financialTransactionId!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiPropertyOptional({ nullable: true })
  creatorName!: string | null;

  @ApiProperty()
  createdAt!: Date;
}
