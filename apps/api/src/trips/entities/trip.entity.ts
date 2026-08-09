import { ApiProperty } from '@nestjs/swagger';
import { TripLoadStatus, TripPriority, TripStatus } from '@prisma/client';

export class TripEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  customerId!: string | null;

  @ApiProperty({ nullable: true })
  customerName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  driverId!: string | null;

  @ApiProperty({ nullable: true })
  driverName!: string | null;

  @ApiProperty({ format: 'uuid' })
  originLocationId!: string;

  @ApiProperty()
  originName!: string;

  @ApiProperty({ format: 'uuid' })
  destinationLocationId!: string;

  @ApiProperty()
  destinationName!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  compositionId!: string | null;

  @ApiProperty({ nullable: true, description: 'Placa do cavalo mecanico da composicao vinculada.' })
  vehiclePlate!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  tollRouteId!: string | null;

  @ApiProperty({ nullable: true, description: 'Nome da rota de pedagio vinculada.' })
  tollRouteName!: string | null;

  @ApiProperty({ enum: TripStatus })
  status!: TripStatus;

  @ApiProperty({ enum: TripPriority })
  priority!: TripPriority;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ nullable: true })
  plannedDeparture!: Date | null;

  @ApiProperty({ nullable: true })
  plannedArrival!: Date | null;

  @ApiProperty({ nullable: true })
  actualDeparture!: Date | null;

  @ApiProperty({ nullable: true })
  actualArrival!: Date | null;

  @ApiProperty({
    enum: TripLoadStatus,
    nullable: true,
    description: 'Carregado ou vazio, informado pelo motorista na largada (Fase 27).',
  })
  loadStatus!: TripLoadStatus | null;

  @ApiProperty({
    nullable: true,
    description: 'Odometro (KM) do veiculo no momento da largada, informado pelo motorista.',
  })
  initialOdometerKm!: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Ultima leitura conhecida do odometro do veiculo (Vehicle.odometerKm).',
  })
  currentOdometerKm!: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Quantidade normal de eixos da composicao vinculada (AxleConfiguration.totalAxles).',
  })
  defaultAxles!: number | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
