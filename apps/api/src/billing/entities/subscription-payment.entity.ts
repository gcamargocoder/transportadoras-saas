import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionPaymentMethod, SubscriptionPaymentStatus } from '@prisma/client';

export class SubscriptionPaymentEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  subscriptionId!: string;

  @ApiProperty()
  amount!: number;

  @ApiProperty()
  dueDate!: Date;

  @ApiProperty({ nullable: true })
  paidAt!: Date | null;

  @ApiProperty({ enum: SubscriptionPaymentMethod })
  paymentMethod!: SubscriptionPaymentMethod;

  @ApiProperty({ enum: SubscriptionPaymentStatus })
  status!: SubscriptionPaymentStatus;

  @ApiProperty({ nullable: true })
  reference!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty()
  createdByName!: string;

  @ApiProperty()
  createdAt!: Date;
}
