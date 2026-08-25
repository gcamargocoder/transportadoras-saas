import { ApiProperty } from '@nestjs/swagger';
import { PartStockMovementType } from '@prisma/client';

export class PartStockMovementEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  partId!: string;

  @ApiProperty({ enum: PartStockMovementType })
  type!: PartStockMovementType;

  @ApiProperty({ description: 'IN/OUT: sempre positivo. ADJUSTMENT: delta com sinal.' })
  quantity!: number;

  @ApiProperty({ nullable: true })
  unitCost!: number | null;

  @ApiProperty()
  movementDate!: Date;

  @ApiProperty({ nullable: true })
  reason!: string | null;

  @ApiProperty({ nullable: true })
  reference!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'OS de origem, quando aplicavel.' })
  maintenanceId!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty()
  createdAt!: Date;
}
