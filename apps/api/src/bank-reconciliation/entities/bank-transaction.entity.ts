import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FinancialBankTransactionStatus, FinancialTransactionType } from '@prisma/client';
import { FinancialTransactionEntity } from '../../finance-accounts/entities/financial-transaction.entity';

// Movimentacao bancaria IMPORTADA (Fase 80) -- representacao EXTERNA,
// nunca o ledger oficial (ver FinancialTransactionEntity, Fase 78).
export class BankTransactionEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  financialAccountId!: string;

  @ApiPropertyOptional({ nullable: true })
  financialAccountName!: string | null;

  @ApiProperty()
  date!: Date;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  amount!: number;

  @ApiProperty({ enum: FinancialTransactionType })
  type!: FinancialTransactionType;

  @ApiPropertyOptional({ nullable: true })
  externalId!: string | null;

  @ApiProperty({ enum: FinancialBankTransactionStatus })
  status!: FinancialBankTransactionStatus;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  financialTransactionId!: string | null;

  @ApiPropertyOptional({
    type: FinancialTransactionEntity,
    nullable: true,
    description: 'Presente quando conciliada (MATCHED/DIVERGENT) -- a transacao interna vinculada.',
  })
  financialTransaction?: FinancialTransactionEntity | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Diferenca em dias entre a data bancaria e a data da FinancialTransaction, quando DIVERGENT.',
  })
  dateDifferenceDays?: number | null;

  @ApiProperty()
  importedAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
