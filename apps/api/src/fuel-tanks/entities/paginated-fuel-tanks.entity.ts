import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { FuelTankEntity } from './fuel-tank.entity';

export class PaginatedFuelTanksEntity {
  @ApiProperty({ type: [FuelTankEntity] })
  items!: FuelTankEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
