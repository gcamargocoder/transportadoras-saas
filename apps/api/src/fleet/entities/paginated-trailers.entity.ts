import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { TrailerEntity } from './trailer.entity';

export class PaginatedTrailersEntity {
  @ApiProperty({ type: [TrailerEntity] })
  items!: TrailerEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
