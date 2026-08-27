import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { DeliveryStopListItemEntity } from './delivery-stop-list-item.entity';

export class PaginatedDeliveryStopsEntity {
  @ApiProperty({ type: [DeliveryStopListItemEntity] })
  items!: DeliveryStopListItemEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
