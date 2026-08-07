import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { TollPlazaEntity } from './toll-plaza.entity';

export class PaginatedTollPlazasEntity {
  @ApiProperty({ type: [TollPlazaEntity] })
  items!: TollPlazaEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
