import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { TripCompositionEntity } from './trip-composition.entity';

export class PaginatedTripCompositionsEntity {
  @ApiProperty({ type: [TripCompositionEntity] })
  items!: TripCompositionEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
