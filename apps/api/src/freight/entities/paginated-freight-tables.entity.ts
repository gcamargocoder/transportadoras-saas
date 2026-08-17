import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { FreightTableEntity } from './freight-table.entity';

export class PaginatedFreightTablesEntity {
  @ApiProperty({ type: [FreightTableEntity] })
  items!: FreightTableEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
