import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { TripAdvanceEntity } from './trip-advance.entity';

export class PaginatedTripAdvancesEntity {
  @ApiProperty({ type: [TripAdvanceEntity] })
  items!: TripAdvanceEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
