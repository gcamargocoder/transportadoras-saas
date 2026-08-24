import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { FinancialTransactionEntity } from './financial-transaction.entity';

export class PaginatedFinancialTransactionsEntity {
  @ApiProperty({ type: [FinancialTransactionEntity] })
  items!: FinancialTransactionEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
