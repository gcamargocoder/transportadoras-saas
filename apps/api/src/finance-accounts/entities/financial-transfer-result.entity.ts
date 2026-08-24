import { ApiProperty } from '@nestjs/swagger';
import { FinancialTransactionEntity } from './financial-transaction.entity';

// POST /finance/transfers -- as duas pontas criadas atomicamente (Fase 78,
// secao 4). transferId e o referenceId comum gravado em ambas as linhas de
// FinancialTransaction (referenceType='FinancialTransfer') -- unico vinculo
// entre elas, sem tabela FinancialTransfer dedicada.
export class FinancialTransferResultEntity {
  @ApiProperty({ format: 'uuid' })
  transferId!: string;

  @ApiProperty({ type: FinancialTransactionEntity })
  debit!: FinancialTransactionEntity;

  @ApiProperty({ type: FinancialTransactionEntity })
  credit!: FinancialTransactionEntity;
}
