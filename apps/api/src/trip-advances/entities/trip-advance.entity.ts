import { ApiProperty } from '@nestjs/swagger';
import { ExpensePaymentMethod } from '@prisma/client';

export class TripAdvanceEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ format: 'uuid' })
  driverId!: string;

  @ApiProperty({ nullable: true })
  driverName!: string | null;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  amount!: number;

  @ApiProperty({ enum: ExpensePaymentMethod, nullable: true })
  paymentMethod!: ExpensePaymentMethod | null;

  @ApiProperty()
  paidAt!: Date;

  @ApiProperty({ format: 'uuid', nullable: true })
  attachmentId!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty({ nullable: true })
  creatorName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  updatedBy!: string | null;

  @ApiProperty({ nullable: true })
  updaterName!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
