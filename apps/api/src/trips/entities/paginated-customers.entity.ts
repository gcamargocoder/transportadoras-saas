import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { CustomerEntity } from './customer.entity';

export class PaginatedCustomersEntity {
  @ApiProperty({ type: [CustomerEntity] })
  items!: CustomerEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
