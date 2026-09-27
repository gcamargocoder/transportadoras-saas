import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { FuelTankInventoryCheckEntity } from './fuel-tank-inventory-check.entity';

export class PaginatedFuelTankInventoryChecksEntity {
  @ApiProperty({ type: [FuelTankInventoryCheckEntity] })
  items!: FuelTankInventoryCheckEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
