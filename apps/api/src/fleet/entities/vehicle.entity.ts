import { ApiProperty } from '@nestjs/swagger';
import { VehicleFuelType, VehicleStatus, VehicleType } from '@prisma/client';

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

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
