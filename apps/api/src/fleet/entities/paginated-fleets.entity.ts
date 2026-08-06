import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { FleetEntity } from './fleet.entity';

export class PaginatedFleetsEntity {
  @ApiProperty({ type: [FleetEntity] })
  items!: FleetEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
