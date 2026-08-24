import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { FinancialAccountEntity } from './financial-account.entity';

export class PaginatedFinancialAccountsEntity {
  @ApiProperty({ type: [FinancialAccountEntity] })
  items!: FinancialAccountEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
