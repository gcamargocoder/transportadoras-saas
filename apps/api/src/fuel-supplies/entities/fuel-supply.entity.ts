import { ApiProperty } from '@nestjs/swagger';
import { FuelType, PaymentType } from '@prisma/client';

export class FuelSupplyEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty({ nullable: true })
  vehiclePlate!: string | null;

  @ApiProperty({ format: 'uuid' })
  driverId!: string;

  @ApiProperty({ nullable: true })
  driverName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  tripId!: string | null;

  @ApiProperty({ format: 'uuid' })
  fuelStationId!: string;

  @ApiProperty({ nullable: true })
  fuelStationName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  attachmentId!: string | null;

  @ApiProperty({ enum: FuelType })
  fuelType!: FuelType;

  @ApiProperty()
  liters!: number;

  @ApiProperty()
  pricePerLiter!: number;

  @ApiProperty({ description: 'Calculado automaticamente: liters * pricePerLiter.' })
  totalAmount!: number;

  @ApiProperty()
  odometerKm!: number;

  @ApiProperty()
  supplyDate!: Date;

  @ApiProperty({ enum: PaymentType, nullable: true })
  paymentType!: PaymentType | null;

  @ApiProperty({ nullable: true })
  invoiceNumber!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

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
