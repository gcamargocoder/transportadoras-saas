import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { PartEntity } from './part.entity';

export class PaginatedPartsEntity {
  @ApiProperty({ type: [PartEntity] })
  items!: PartEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
