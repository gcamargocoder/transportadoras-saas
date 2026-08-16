import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { TenantListItemEntity } from './tenant-list-item.entity';

export class PaginatedTenantsEntity {
  @ApiProperty({ type: [TenantListItemEntity] })
  items!: TenantListItemEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
