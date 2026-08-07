import { ApiProperty } from '@nestjs/swagger';
import { TollTransactionSource, TollTransactionStatus } from '@prisma/client';

export class TollTransactionEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty({ nullable: true })
  vehiclePlate!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  driverId!: string | null;

  @ApiProperty({ nullable: true })
  driverName!: string | null;

  @ApiProperty({ format: 'uuid' })
  tollPlazaId!: string;

  @ApiProperty()
  tollPlazaName!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  tagProviderId!: string | null;

  @ApiProperty({ nullable: true })
  tagProviderName!: string | null;

  @ApiProperty()
  axleCount!: number;

  @ApiProperty({ description: 'Calculado automaticamente: pricePerAxle * axleCount.' })
  expectedAmount!: number;

  @ApiProperty()
  chargedAmount!: number;

  @ApiProperty({ description: 'Calculado automaticamente: chargedAmount - expectedAmount.' })
  discrepancyAmount!: number;

  @ApiProperty({ enum: TollTransactionStatus })
  status!: TollTransactionStatus;

  @ApiProperty()
  chargedAt!: Date;

  @ApiProperty({ enum: TollTransactionSource })
  source!: TollTransactionSource;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
