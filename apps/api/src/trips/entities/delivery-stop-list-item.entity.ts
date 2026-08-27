import { ApiProperty } from '@nestjs/swagger';
import { TripDeliveryStopStatus, TripStatus } from '@prisma/client';

// Fase 99 -- linha da listagem CROSS-TRIP de entregas. Reaproveita todos os
// campos de TripDeliveryStopEntity (nunca duplica sua definicao/mapper de
// origem -- so acrescenta o contexto minimo da viagem, necessario numa
// visao que atravessa varias viagens ao mesmo tempo).
export class DeliveryStopListItemEntity {
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

  @ApiProperty({ format: 'uuid', nullable: true })
  driverId!: string | null;

  @ApiProperty({ nullable: true })
  driverName!: string | null;

  @ApiProperty({ example: 1 })
  sequence!: number;

  @ApiProperty({ format: 'uuid', nullable: true })
  customerId!: string | null;

  @ApiProperty({ nullable: true })
  customerName!: string | null;

  @ApiProperty({ format: 'uuid' })
  locationId!: string;

  @ApiProperty()
  locationName!: string;

  @ApiProperty({ nullable: true })
  locationAddress!: string | null;

  @ApiProperty({ enum: TripDeliveryStopStatus })
  status!: TripDeliveryStopStatus;

  @ApiProperty({ nullable: true })
  plannedArrival!: Date | null;

  @ApiProperty({ nullable: true })
  actualArrival!: Date | null;

  @ApiProperty({ nullable: true })
  deliveredAt!: Date | null;

  @ApiProperty({ nullable: true })
  failureReason!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
