import { ApiProperty } from '@nestjs/swagger';
import { DriverStatus, DriverType } from '@prisma/client';

// GET /vehicles/:id/driver-assignments -- mesma tabela DriverVehicleAssignment
// (Fase 61) da perspectiva inversa (motorista deste veiculo, nao veiculo
// deste motorista). Nunca duplica a tabela.
export class VehicleDriverAssignmentEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty({ format: 'uuid' })
  driverId!: string;

  @ApiProperty({ nullable: true })
  driverName!: string | null;

  @ApiProperty({ enum: DriverType, nullable: true })
  driverType!: DriverType | null;

  @ApiProperty({ enum: DriverStatus, nullable: true })
  driverStatus!: DriverStatus | null;

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
