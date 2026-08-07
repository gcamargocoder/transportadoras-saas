import { ApiProperty } from '@nestjs/swagger';
import { RevenueCategory } from '@prisma/client';

export class TripRevenueEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: RevenueCategory })
  category!: RevenueCategory;

  @ApiProperty()
  amount!: number;

  @ApiProperty()
  receivedAt!: Date;

  @ApiProperty({ nullable: true })
  invoiceNumber!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  customerId!: string | null;

  @ApiProperty({ nullable: true })
  customerName!: string | null;

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
