import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { SubscriptionEntity } from './subscription.entity';

export class PaginatedSubscriptionsEntity {
  @ApiProperty({ type: [SubscriptionEntity] })
  items!: SubscriptionEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
