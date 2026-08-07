import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { TireRetreadEntity } from './tire-retread.entity';

export class PaginatedTireRetreadsEntity {
  @ApiProperty({ type: [TireRetreadEntity] })
  items!: TireRetreadEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
