import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { TollTransactionEntity } from './toll-transaction.entity';

export class PaginatedTollTransactionsEntity {
  @ApiProperty({ type: [TollTransactionEntity] })
  items!: TollTransactionEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
