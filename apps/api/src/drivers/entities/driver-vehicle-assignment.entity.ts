import { ApiProperty } from '@nestjs/swagger';

export class DriverVehicleAssignmentEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  driverId!: string;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty({ nullable: true })
  vehiclePlate!: string | null;

  @ApiProperty()
  startedAt!: Date;

  @ApiProperty({ nullable: true, description: 'Nulo = vinculo atual (ainda em vigor).' })
  endedAt!: Date | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty({ nullable: true })
  creatorName!: string | null;

  @ApiProperty()
  createdAt!: Date;
}
