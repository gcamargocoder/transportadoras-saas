import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';
import { SubscriptionPaymentEntity } from './subscription-payment.entity';

export class PaginatedSubscriptionPaymentsEntity {
  @ApiProperty({ type: [SubscriptionPaymentEntity] })
  items!: SubscriptionPaymentEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
