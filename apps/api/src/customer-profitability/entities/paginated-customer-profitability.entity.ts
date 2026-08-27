import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { CustomerProfitabilityEntity } from './customer-profitability.entity';

export class PaginatedCustomerProfitabilityEntity {
  @ApiProperty({ type: [CustomerProfitabilityEntity] })
  items!: CustomerProfitabilityEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
