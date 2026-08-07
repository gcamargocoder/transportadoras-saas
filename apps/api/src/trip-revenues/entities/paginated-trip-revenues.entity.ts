import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { TripRevenueEntity } from './trip-revenue.entity';

export class PaginatedTripRevenuesEntity {
  @ApiProperty({ type: [TripRevenueEntity] })
  items!: TripRevenueEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
