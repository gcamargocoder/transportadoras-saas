import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { TireMovementEntity } from './tire-movement.entity';

export class PaginatedTireMovementsEntity {
  @ApiProperty({ type: [TireMovementEntity] })
  items!: TireMovementEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
