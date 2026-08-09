import { ApiProperty } from '@nestjs/swagger';
import { FuelType, PaymentType, SyncStatus } from '@prisma/client';

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

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Nulo quando o abastecimento foi registrado apenas com localizacao (app do motorista, sem posto identificado).',
  })
  fuelStationId!: string | null;

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

  @ApiProperty({
    nullable: true,
    description: 'Localizacao do abastecimento (Fase 25) -- preenchida pelo app do motorista.',
  })
  latitude!: number | null;

  @ApiProperty({ nullable: true })
  longitude!: number | null;

  @ApiProperty({ enum: SyncStatus })
  syncStatus!: SyncStatus;

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
