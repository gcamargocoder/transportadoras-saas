import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { FuelSupplyEntity } from './fuel-supply.entity';

export class PaginatedFuelSuppliesEntity {
  @ApiProperty({ type: [FuelSupplyEntity] })
  items!: FuelSupplyEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
