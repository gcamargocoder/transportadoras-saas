import { ApiProperty } from '@nestjs/swagger';
import { TripOccurrenceSeverity, TripOccurrenceType, TripStatus } from '@prisma/client';
import { TripOccurrenceStatus } from './trip-occurrence.entity';

// Fase 101 -- linha da listagem CROSS-TRIP de ocorrencias de entrega
// (GET /delivery-occurrences). Reaproveita todos os campos de
// TripOccurrenceEntity (nunca duplica a definicao/mapper de origem -- so
// acrescenta o contexto minimo da viagem/parada, necessario numa visao que
// atravessa varias viagens ao mesmo tempo), mesmo padrao de
// DeliveryStopListItemEntity (Fase 99).
export class DeliveryOccurrenceListItemEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ enum: TripStatus })
  tripStatus!: TripStatus;

  @ApiProperty()
  tripOriginName!: string;

  @ApiProperty()
  tripDestinationName!: string;

  // Fase 115 -- nullable: esta mesma entidade passou a ser reaproveitada
  // tambem por GET /trip-occurrences (todas as ocorrencias, Fase 115), que
  // inclui ocorrencias GERAIS da viagem (sem parada vinculada). Em
  // GET /delivery-occurrences (Fase 101, inalterado) estes 2 campos
  // continuam sempre preenchidos, na pratica -- a mudanca de tipo e so
  // uma ampliacao, nunca uma remocao de garantia para quem ja consome
  // aquele endpoint.
  @ApiProperty({ format: 'uuid', nullable: true })
  tripDeliveryStopId!: string | null;

  @ApiProperty({ nullable: true, description: 'Sequencia (#N) da parada, quando a ocorrencia esta vinculada a uma.' })
  tripDeliveryStopSequence!: number | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  driverId!: string | null;

  @ApiProperty({ nullable: true })
  driverName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  vehicleId!: string | null;

  @ApiProperty({ nullable: true })
  vehiclePlate!: string | null;

  @ApiProperty({ enum: TripOccurrenceType })
  type!: TripOccurrenceType;

  @ApiProperty({ enum: TripOccurrenceSeverity })
  severity!: TripOccurrenceSeverity;

  @ApiProperty()
  status!: TripOccurrenceStatus;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  occurredAt!: Date;

  @ApiProperty({ nullable: true })
  resolvedAt!: Date | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  resolvedBy!: string | null;

  @ApiProperty({ nullable: true })
  resolverName!: string | null;

  @ApiProperty({ nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  attachmentId!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty({ nullable: true })
  creatorName!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
