import { ApiProperty } from '@nestjs/swagger';
import { VehicleIdlePeriodSource, VehicleIdleReason } from '@prisma/client';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';

export type VehicleIdlePeriodStatus = 'OPEN' | 'CLOSED';

// Fase B -- periodo ocioso PERSISTIDO. `status` e SEMPRE derivado de
// `endedAt` no mapper (OPEN quando null, CLOSED caso contrario) -- nunca uma
// coluna redundante que poderia dessincronizar (mesmo padrao de TripStop/
// TripOccurrence).
export class VehicleIdlePeriodEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty({ nullable: true, description: 'Placa do veiculo (null se o veiculo foi removido).' })
  plate!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  startedAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'null enquanto o periodo esta aberto.' })
  endedAt!: Date | null;

  @ApiProperty({ nullable: true, description: 'Sempre calculado pelo backend no fechamento (nunca negativo).' })
  durationMinutes!: number | null;

  @ApiProperty({ enum: VehicleIdleReason })
  reason!: VehicleIdleReason;

  @ApiProperty({ enum: VehicleIdlePeriodSource })
  source!: VehicleIdlePeriodSource;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Viagem cuja conclusao abriu o periodo.' })
  tripBeforeId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Viagem cujo inicio fechou o periodo.' })
  tripAfterId!: string | null;

  @ApiProperty({ nullable: true, description: 'Destino da viagem anterior (tripBefore.destination.name).' })
  previousDestinationLabel!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ enum: ['OPEN', 'CLOSED'] })
  status!: VehicleIdlePeriodStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class PaginatedVehicleIdlePeriodsEntity {
  @ApiProperty({ type: [VehicleIdlePeriodEntity] })
  items!: VehicleIdlePeriodEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
