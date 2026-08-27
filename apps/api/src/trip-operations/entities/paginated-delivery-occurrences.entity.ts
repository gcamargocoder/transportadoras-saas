import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { DeliveryOccurrenceListItemEntity } from './delivery-occurrence-list-item.entity';

export class PaginatedDeliveryOccurrencesEntity {
  @ApiProperty({ type: [DeliveryOccurrenceListItemEntity] })
  items!: DeliveryOccurrenceListItemEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
