import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { BankTransactionEntity } from './bank-transaction.entity';

export class PaginatedBankTransactionsEntity {
  @ApiProperty({ type: [BankTransactionEntity] })
  items!: BankTransactionEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
