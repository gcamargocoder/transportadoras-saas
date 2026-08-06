import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { TenantEntity } from './tenant.entity';

export class PaginatedTenantsEntity {
  @ApiProperty({ type: [TenantEntity] })
  items!: TenantEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
