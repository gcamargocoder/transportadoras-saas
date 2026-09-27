import { ApiProperty } from '@nestjs/swagger';
import { FuelTankStatus, FuelType } from '@prisma/client';

export class FuelTankEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: FuelType })
  fuelType!: FuelType;

  @ApiProperty()
  capacityLiters!: number;

  @ApiProperty()
  initialStockLiters!: number;

  @ApiProperty({ description: 'Cache persistido, sempre recalculado pelo service (nunca aceito do cliente).' })
  currentStockLiters!: number;

  @ApiProperty({ nullable: true })
  minStockLiters!: number | null;

  @ApiProperty({ description: 'currentStockLiters / capacityLiters * 100, arredondado a 1 casa decimal.' })
  occupancyPercent!: number;

  @ApiProperty({ description: 'Cache persistido: currentStockLiters <= minStockLiters (false quando minStockLiters nao informado).' })
  isLowStock!: boolean;

  @ApiProperty({ nullable: true })
  location!: string | null;

  @ApiProperty({ enum: FuelTankStatus })
  status!: FuelTankStatus;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
