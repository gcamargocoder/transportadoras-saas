import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { FuelTankMovementEntity } from './fuel-tank-movement.entity';

export class PaginatedFuelTankMovementsEntity {
  @ApiProperty({ type: [FuelTankMovementEntity] })
  items!: FuelTankMovementEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
