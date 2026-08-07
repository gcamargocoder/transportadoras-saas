import { ApiProperty } from '@nestjs/swagger';
import { ExpenseCategory, ExpensePaymentMethod, ExpenseStatus } from '@prisma/client';

export class TripExpenseEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  driverId!: string | null;

  @ApiProperty({ nullable: true })
  driverName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  vehicleId!: string | null;

  @ApiProperty({ nullable: true })
  vehiclePlate!: string | null;

  @ApiProperty({ enum: ExpenseCategory })
  category!: ExpenseCategory;

  @ApiProperty()
  description!: string;

  @ApiProperty({ nullable: true })
  supplier!: string | null;

  @ApiProperty({ nullable: true })
  documentNumber!: string | null;

  @ApiProperty()
  expenseDate!: Date;

  @ApiProperty()
  amount!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ enum: ExpensePaymentMethod, nullable: true })
  paymentMethod!: ExpensePaymentMethod | null;

  @ApiProperty({ enum: ExpenseStatus })
  status!: ExpenseStatus;

  @ApiProperty({ format: 'uuid', nullable: true })
  approvedBy!: string | null;

  @ApiProperty({ nullable: true })
  approverName!: string | null;

  @ApiProperty({ nullable: true })
  approvedAt!: Date | null;

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
