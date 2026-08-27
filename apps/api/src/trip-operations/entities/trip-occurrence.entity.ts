import { ApiProperty } from '@nestjs/swagger';
import { TripOccurrenceSeverity, TripOccurrenceType } from '@prisma/client';

export type TripOccurrenceStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';

export const TRIP_OCCURRENCE_STATUSES: TripOccurrenceStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'];

// Fase 67 -- status e SEMPRE derivado de resolvedAt/cancelledAt no mapper,
// nunca uma coluna redundante (mesmo padrao de TripStop, ver
// computeTripStopStatus). CANCELLED tem prioridade sobre RESOLVED (uma
// ocorrencia resolvida pode ser cancelada depois, correcao administrativa
// de um registro indevido).
export class TripOccurrenceEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  // Fase 101 -- vinculo direto com a parada/entrega especifica (Fase 88).
  @ApiProperty({ format: 'uuid', nullable: true })
  tripDeliveryStopId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Jornada do motorista em curso no momento do registro, quando houver.' })
  driverShiftId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  driverId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  vehicleId!: string | null;

  @ApiProperty({ enum: TripOccurrenceType })
  type!: TripOccurrenceType;

  @ApiProperty({ enum: TripOccurrenceSeverity })
  severity!: TripOccurrenceSeverity;

  @ApiProperty({
    enum: TRIP_OCCURRENCE_STATUSES,
    description: 'Sempre computado a partir de resolvedAt/cancelledAt -- nunca uma coluna redundante.',
  })
  status!: TripOccurrenceStatus;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  occurredAt!: Date;

  @ApiProperty({ nullable: true })
  latitude!: number | null;

  @ApiProperty({ nullable: true })
  longitude!: number | null;

  @ApiProperty({ nullable: true })
  locationLabel!: string | null;

  // Fase 101 -- marca que a ocorrencia esta sendo tratada (status IN_PROGRESS).
  @ApiProperty({ nullable: true })
  inProgressAt!: Date | null;

  @ApiProperty({ nullable: true })
  resolvedAt!: Date | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  resolvedBy!: string | null;

  @ApiProperty({ nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Evidencia (foto) via Attachment -- mesmo mecanismo generico de storage.' })
  attachmentId!: string | null;

  @ApiProperty({ nullable: true, type: 'object' })
  metadata!: Record<string, unknown> | null;

  @ApiProperty({ nullable: true, description: 'Chave de idempotencia do driver-app. Nulo para ocorrencias criadas pelo admin.' })
  deviceEventId!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
