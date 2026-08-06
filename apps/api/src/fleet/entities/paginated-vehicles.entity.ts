import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { VehicleEntity } from './vehicle.entity';

export class PaginatedVehiclesEntity {
  @ApiProperty({ type: [VehicleEntity] })
  items!: VehicleEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
