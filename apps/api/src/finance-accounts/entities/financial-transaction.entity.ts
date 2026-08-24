import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FinancialTransactionType } from '@prisma/client';

// Movimentacao (Fase 78) -- append-only, nunca alteravel/excluivel pela API.
export class FinancialTransactionEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  accountId!: string;

  @ApiProperty({ enum: FinancialTransactionType })
  type!: FinancialTransactionType;

  @ApiProperty()
  amount!: number;

  @ApiProperty()
  transactionDate!: Date;

  @ApiProperty()
  description!: string;

  @ApiPropertyOptional({ nullable: true })
  referenceType!: string | null;

  @ApiPropertyOptional({ nullable: true })
  referenceId!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiPropertyOptional({ nullable: true })
  creatorName!: string | null;

  @ApiProperty()
  createdAt!: Date;
}
