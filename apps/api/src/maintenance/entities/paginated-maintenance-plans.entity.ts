import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { MaintenancePlanEntity } from './maintenance-plan.entity';

export class PaginatedMaintenancePlansEntity {
  @ApiProperty({ type: [MaintenancePlanEntity] })
  items!: MaintenancePlanEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
