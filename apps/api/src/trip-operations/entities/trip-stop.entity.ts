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

  @ApiProperty()
  createdAt!: Date;
}
