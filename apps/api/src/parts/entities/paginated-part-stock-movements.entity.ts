import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { PartStockMovementEntity } from './part-stock-movement.entity';

export class PaginatedPartStockMovementsEntity {
  @ApiProperty({ type: [PartStockMovementEntity] })
  items!: PartStockMovementEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
