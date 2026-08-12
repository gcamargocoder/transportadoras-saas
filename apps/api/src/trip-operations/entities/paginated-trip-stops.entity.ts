import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { TripStopEntity } from './trip-stop.entity';

export class PaginatedTripStopsEntity {
  @ApiProperty({ type: [TripStopEntity] })
  items!: TripStopEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
