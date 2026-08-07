import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { FuelStationEntity } from './fuel-station.entity';

export class PaginatedFuelStationsEntity {
  @ApiProperty({ type: [FuelStationEntity] })
  items!: FuelStationEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
