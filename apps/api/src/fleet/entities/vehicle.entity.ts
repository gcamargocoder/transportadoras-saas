import { ApiProperty } from '@nestjs/swagger';
import { VehicleFuelType, VehicleOwnershipType, VehicleStatus, VehicleType } from '@prisma/client';

export const VEHICLE_AVAILABILITY_VALUES = ['AVAILABLE', 'ON_TRIP', 'UNAVAILABLE'] as const;
export type VehicleAvailabilityValue = (typeof VEHICLE_AVAILABILITY_VALUES)[number];

export class VehicleEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  fleetId!: string | null;

  @ApiProperty()
  plate!: string;

  @ApiProperty({ nullable: true })
  renavam!: string | null;

  @ApiProperty({ nullable: true })
  chassisNumber!: string | null;

  @ApiProperty()
  brand!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty({ nullable: true })
  manufactureYear!: number | null;

  @ApiProperty({ nullable: true })
  modelYear!: number | null;

  @ApiProperty({ nullable: true })
  color!: string | null;

  @ApiProperty({ enum: VehicleType })
  type!: VehicleType;

  @ApiProperty({ nullable: true })
  category!: string | null;

  @ApiProperty({ enum: VehicleFuelType, nullable: true })
  fuelType!: VehicleFuelType | null;

  @ApiProperty({ nullable: true, description: 'Capacidade do tanque, em litros.' })
  tankCapacityLiters!: number | null;

  @ApiProperty({ nullable: true, description: 'Consumo medio, em km/litro.' })
  averageConsumptionKmL!: number | null;

  @ApiProperty({ nullable: true, description: 'Quilometragem atual do veiculo.' })
  odometerKm!: number | null;

  @ApiProperty({ nullable: true, description: 'Peso Bruto Total (PBT), em kg.' })
  grossWeightKg!: number | null;

  @ApiProperty({ nullable: true, description: 'Peso liquido (tara), em kg.' })
  netWeightKg!: number | null;

  @ApiProperty({ nullable: true, description: 'Capacidade de carga, em kg.' })
  cargoCapacityKg!: number | null;

  @ApiProperty({ nullable: true, description: 'Quantidade de eixos do veiculo.' })
  axleCount!: number | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ enum: VehicleStatus })
  status!: VehicleStatus;

  @ApiProperty({ enum: VehicleOwnershipType })
  ownershipType!: VehicleOwnershipType;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Motorista atualmente vinculado (DriverVehicleAssignment sem endedAt).',
  })
  currentDriverId!: string | null;

  @ApiProperty({ nullable: true })
  currentDriverName!: string | null;

  @ApiProperty({
    enum: VEHICLE_AVAILABILITY_VALUES,
    description:
      'Derivado (nunca persistido): AVAILABLE (ACTIVE e sem viagem em andamento), ON_TRIP (ACTIVE em ' +
      'viagem) ou UNAVAILABLE (INACTIVE/SUSPENDED/MAINTENANCE/SOLD).',
  })
  availability!: VehicleAvailabilityValue;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
