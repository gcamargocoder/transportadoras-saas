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

  @ApiPropertyOptional({ nullable: true })
  reference!: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiPropertyOptional({ nullable: true })
  creatorName!: string | null;

  @ApiProperty()
  createdAt!: Date;
}
