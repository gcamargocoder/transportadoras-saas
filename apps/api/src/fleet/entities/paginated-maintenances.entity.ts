import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { MaintenanceEntity } from './maintenance.entity';

export class PaginatedMaintenancesEntity {
  @ApiProperty({ type: [MaintenanceEntity] })
  items!: MaintenanceEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
