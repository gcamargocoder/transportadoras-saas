import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { LocationEntity } from './location.entity';

export class PaginatedLocationsEntity {
  @ApiProperty({ type: [LocationEntity] })
  items!: LocationEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
