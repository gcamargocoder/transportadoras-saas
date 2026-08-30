import { ApiProperty } from '@nestjs/swagger';
import { TireLocationType } from '@prisma/client';

export class TireMovementEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tireId!: string;

  @ApiProperty()
  movementDate!: Date;

  @ApiProperty({ enum: TireLocationType, nullable: true })
  previousLocationType!: TireLocationType | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  previousVehicleId!: string | null;

  @ApiProperty({ nullable: true })
  previousVehiclePlate!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  previousTrailerId!: string | null;

  @ApiProperty({ nullable: true })
  previousTrailerPlate!: string | null;

  @ApiProperty({ nullable: true })
  previousPosition!: string | null;

  @ApiProperty({ enum: TireLocationType })
  newLocationType!: TireLocationType;

  @ApiProperty({ format: 'uuid', nullable: true })
  newVehicleId!: string | null;

  @ApiProperty({ nullable: true })
  newVehiclePlate!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  newTrailerId!: string | null;

  @ApiProperty({ nullable: true })
  newTrailerPlate!: string | null;

  @ApiProperty({ nullable: true })
  newPosition!: string | null;

  @ApiProperty({ nullable: true })
  odometerKm!: number | null;

  @ApiProperty({ nullable: true })
  reason!: string | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Fase 109 -- OS (VehicleMaintenance) que motivou esta troca, quando aplicavel.',
  })
  maintenanceId!: string | null;

  @ApiProperty({ nullable: true })
  maintenanceServiceOrderNumber!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty({ nullable: true })
  creatorName!: string | null;

  @ApiProperty()
  createdAt!: Date;
}
