import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { TollRouteEntity } from './toll-route.entity';

export class PaginatedTollRoutesEntity {
  @ApiProperty({ type: [TollRouteEntity] })
  items!: TollRouteEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
