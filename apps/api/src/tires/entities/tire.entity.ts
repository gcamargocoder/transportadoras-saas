import { ApiProperty } from '@nestjs/swagger';
import { TireLocationType, TireStatus } from '@prisma/client';

export class TireEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  fireNumber!: string;

  @ApiProperty()
  manufacturer!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty()
  size!: string;

  @ApiProperty({ nullable: true })
  dot!: string | null;

  @ApiProperty({ nullable: true })
  serialNumber!: string | null;

  @ApiProperty({ nullable: true })
  purchaseDate!: Date | null;

  @ApiProperty({ nullable: true })
  purchasePrice!: number | null;

  @ApiProperty({ nullable: true })
  expectedLifespanKm!: number | null;

  @ApiProperty({ nullable: true })
  initialTreadDepthMm!: number | null;

  @ApiProperty({ nullable: true })
  currentTreadDepthMm!: number | null;

  @ApiProperty({ enum: TireStatus })
  status!: TireStatus;

  @ApiProperty({ enum: TireLocationType })
  locationType!: TireLocationType;

  @ApiProperty({ format: 'uuid', nullable: true })
  vehicleId!: string | null;

  @ApiProperty({ nullable: true })
  vehiclePlate!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  trailerId!: string | null;

  @ApiProperty({ nullable: true })
  trailerPlate!: string | null;

  @ApiProperty({ nullable: true })
  position!: string | null;

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
