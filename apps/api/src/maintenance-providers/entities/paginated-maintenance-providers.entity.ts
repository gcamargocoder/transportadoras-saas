import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { MaintenanceProviderEntity } from './maintenance-provider.entity';

export class PaginatedMaintenanceProvidersEntity {
  @ApiProperty({ type: [MaintenanceProviderEntity] })
  items!: MaintenanceProviderEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
