import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { TireEntity } from './tire.entity';

export class PaginatedTiresEntity {
  @ApiProperty({ type: [TireEntity] })
  items!: TireEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
