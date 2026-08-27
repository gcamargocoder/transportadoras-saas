import { ApiProperty } from '@nestjs/swagger';
import { TripDeliveryStopStatus } from '@prisma/client';

export class TripDeliveryStopEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

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

  @ApiProperty({ nullable: true, description: 'Endereco cadastrado do local, quando houver.' })
  locationAddress!: string | null;

  @ApiProperty({ enum: TripDeliveryStopStatus })
  status!: TripDeliveryStopStatus;

  @ApiProperty({ nullable: true, description: 'Previsao de chegada informada manualmente no planejamento.' })
  plannedArrival!: Date | null;

  @ApiProperty({ nullable: true, description: 'Execucao real -- gravado automaticamente ao entrar em IN_PROGRESS.' })
  actualArrival!: Date | null;

  @ApiProperty({ nullable: true, description: 'Execucao real -- gravado automaticamente ao entrar em COMPLETED.' })
  deliveredAt!: Date | null;

  @ApiProperty({ nullable: true, description: 'Motivo da falha, gravado ao entrar em FAILED.' })
  failureReason!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
