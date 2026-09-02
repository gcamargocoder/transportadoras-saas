import { ApiProperty } from '@nestjs/swagger';
import { TripStatus } from '@prisma/client';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';

// Fase 92 -- uma linha da listagem "Viagens vazias". SEMPRE
// Trip.loadStatus === 'EMPTY' (informado pelo motorista na largada, Fase
// 27) -- nunca inferido de ausencia de cliente/entrega (regra 2). `reason`
// e somente um refinamento textual (ver empty-trip.util.ts), nunca o
// criterio que definiu a viagem como vazia. distanceKm/totalCost vem de
// TripMetrics (Fase 27/66) -- null quando ainda nao calculado (viagem nao
// concluida), nunca inventados.
export class EmptyTripEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: TripStatus })
  status!: TripStatus;

  @ApiProperty({ nullable: true })
  plannedDeparture!: Date | null;

  @ApiProperty({ nullable: true })
  actualDeparture!: Date | null;

  @ApiProperty({ nullable: true })
  actualArrival!: Date | null;

  @ApiProperty()
  originName!: string;

  @ApiProperty()
  destinationName!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  vehicleId!: string | null;

  @ApiProperty({ nullable: true })
  vehiclePlate!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  driverId!: string | null;

  @ApiProperty({ nullable: true })
  driverName!: string | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Informativo apenas -- nunca usado para decidir se a viagem e vazia (regra 2).',
  })
  customerId!: string | null;

  @ApiProperty({ nullable: true })
  customerName!: string | null;

  @ApiProperty({
    enum: ['NO_DELIVERIES_PLANNED', 'ALL_DELIVERIES_CANCELLED', 'DELIVERIES_INCOMPLETE', 'COMPLETED_DELIVERIES_INCONSISTENT'],
    description: 'Motivo textual, derivado do status das TripDeliveryStop associadas. Ver docs/trip-empty-runs.md.',
  })
  reason!: string;

  @ApiProperty({ description: 'true quando a viagem tem pelo menos uma TripDeliveryStop cadastrada.' })
  hasDeliveryStops!: boolean;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description:
      'Fase D -- CONTEXTO apenas: viagem de IDA vinculada (Trip.previousTripId), quando esta viagem ' +
      'vazia foi marcada como retorno de outra. NUNCA usado para classificar a viagem como vazia -- ' +
      'a semantica da Fase 92 (loadStatus === EMPTY) permanece o unico criterio.',
  })
  previousTripId!: string | null;

  @ApiProperty({ nullable: true, description: 'TripMetrics.actualDistanceKm -- somente quando ja calculado.' })
  distanceKm!: number | null;

  @ApiProperty({ nullable: true, description: 'TripMetrics.actualTotalCost -- somente quando ja calculado.' })
  totalCost!: number | null;
}

export class PaginatedEmptyTripsEntity {
  @ApiProperty({ type: EmptyTripEntity, isArray: true })
  items!: EmptyTripEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
