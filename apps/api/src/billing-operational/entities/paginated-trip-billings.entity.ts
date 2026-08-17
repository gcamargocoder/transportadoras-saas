import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { TripBillingEntity } from './trip-billing.entity';

export class PaginatedTripBillingsEntity {
  @ApiProperty({ type: [TripBillingEntity] })
  items!: TripBillingEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
