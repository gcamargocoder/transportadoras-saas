import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReceivablePaymentMethod } from '@prisma/client';

// Linha do ledger imutavel de recebimentos (ver ReceivablePayment no
// schema) -- nunca editada/apagada apos criada.
export class ReceivablePaymentEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  receivableId!: string;

  @ApiProperty()
  amount!: number;

  @ApiProperty()
  paymentDate!: Date;

  @ApiProperty({ enum: ReceivablePaymentMethod })
  paymentMethod!: ReceivablePaymentMethod;

  @ApiPropertyOptional({ nullable: true, description: 'Juros recebidos alem do valor do titulo -- nao abate o saldo.' })
  interestAmount!: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Multa recebida alem do valor do titulo -- nao abate o saldo.' })
  fineAmount!: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Desconto concedido -- abate o saldo junto com amount, mas nao movimenta caixa.' })
  discountAmount!: number | null;

  @ApiPropertyOptional({ nullable: true })
  reference!: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  // Fase 79 -- nullable pois recebimentos anteriores a esta fase nunca
  // tiveram conta financeira vinculada (ver docs/financial-payment-integration.md).
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  financialAccountId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  financialAccountName!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'FinancialTransaction (CREDIT) gerada por este recebimento.' })
  financialTransactionId!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiPropertyOptional({ nullable: true })
  creatorName!: string | null;

  @ApiProperty()
  createdAt!: Date;
}
