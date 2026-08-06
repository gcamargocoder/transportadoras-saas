import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { TripEntity } from './trip.entity';

export class PaginatedTripsEntity {
  @ApiProperty({ type: [TripEntity] })
  items!: TripEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
