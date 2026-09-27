import { ApiProperty } from '@nestjs/swagger';
import { FuelTankMovementType } from '@prisma/client';

export class FuelTankMovementEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tankId!: string;

  @ApiProperty({ enum: FuelTankMovementType })
  type!: FuelTankMovementType;

  @ApiProperty({ description: 'INITIAL_BALANCE/RECEIPT/INTERNAL_FUELING: sempre positivo. ADJUSTMENT: delta com sinal.' })
  quantityLiters!: number;

  @ApiProperty()
  previousBalanceLiters!: number;

  @ApiProperty()
  newBalanceLiters!: number;

  @ApiProperty()
  effectiveDate!: Date;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ nullable: true, description: 'Preco por litro pago (RECEIPT). Nulo para os demais tipos.' })
  pricePerLiter!: number | null;

  @ApiProperty({ nullable: true, description: 'quantityLiters * pricePerLiter, sempre calculado (RECEIPT). Nulo para os demais tipos.' })
  totalAmount!: number | null;

  @ApiProperty({ nullable: true })
  invoiceNumber!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Fornecedor do RECEIPT (FuelStation).' })
  fuelStationId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'FuelSupply de origem, quando o movimento e um abastecimento interno.' })
  fuelSupplyId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  vehicleId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  driverId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  tripId!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty()
  createdAt!: Date;
}
