import { ApiProperty } from '@nestjs/swagger';
import { SyncStatus, TripStopSource, TripStopType } from '@prisma/client';

export type TripStopStatus = 'OPEN' | 'COMPLETED' | 'CANCELLED';

export const TRIP_STOP_STATUSES: TripStopStatus[] = ['OPEN', 'COMPLETED', 'CANCELLED'];

export class TripStopEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Nulo para paradas administrativas sem viagem associada (Fase 43).' })
  tripId!: string | null;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  driverId!: string | null;

  @ApiProperty({ enum: TripStopType })
  type!: TripStopType;

  @ApiProperty({
    enum: TRIP_STOP_STATUSES,
    description: 'Sempre computado a partir de endedAt/cancelledAt -- nunca uma coluna redundante.',
  })
  status!: TripStopStatus;

  @ApiProperty({ enum: TripStopSource })
  source!: TripStopSource;

  @ApiProperty({ nullable: true })
  latitude!: number | null;

  @ApiProperty({ nullable: true })
  longitude!: number | null;

  @ApiProperty()
  startedAt!: Date;

  @ApiProperty({ nullable: true })
  endedAt!: Date | null;

  @ApiProperty({ nullable: true })
  durationMinutes!: number | null;

  @ApiProperty({ nullable: true })
  locationLabel!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty({ enum: SyncStatus })
  syncStatus!: SyncStatus;

  @ApiProperty({ description: 'Chave de idempotencia usada na abertura (Fase 43, secao 24 -- detalhe da parada).' })
  deviceEventId!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

// Fase 43 -- GET /trip-stops (listagem administrativa cross-frota, secao 23
// do pedido: colunas Veiculo/Placa/Motorista/Viagem). placa/nome/referencia
// resolvidos em LOTE por TripStopsService.findAllPaginated (3 queries
// extras no total, nunca 1 por linha -- ver comentario la mesmo). null
// quando o dado nao existe (motorista/viagem opcionais desde a Fase 43).
export class TripStopListItemEntity extends TripStopEntity {
  @ApiProperty()
  vehiclePlate!: string;

  @ApiProperty({ nullable: true })
  driverName!: string | null;

  @ApiProperty({ nullable: true, description: 'Origem -> destino da viagem associada, quando houver.' })
  tripReference!: string | null;
}
