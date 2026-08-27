import { ApiProperty } from '@nestjs/swagger';
import { TripDeliveryStopStatus } from '@prisma/client';

// Fase 91 -- de onde veio a previsao (regra 12: sempre indicar a fonte).
// GEOGRAPHIC: RoutePlan (Fase 26/89) + ultima posicao de GPS real
// (TrackingPoint) projetada na polyline -- so possivel para a parada cujo
// local e o MESMO destino final da viagem (unica com coordenada conhecida).
// DELAY_SHIFT: sem geografia disponivel -- desloca o plannedArrival pelo
// atraso REAL de partida (actualDeparture - plannedDeparture). NONE: sem
// dado suficiente (nunca inventado -- ver `limitation`).
export type TripEtaSource = 'GEOGRAPHIC' | 'DELAY_SHIFT' | 'NONE';

export class TripDeliveryStopEtaEntity {
  @ApiProperty({ format: 'uuid' })
  stopId!: string;

  @ApiProperty()
  sequence!: number;

  @ApiProperty({ enum: TripDeliveryStopStatus })
  status!: TripDeliveryStopStatus;

  @ApiProperty({ description: 'true para a proxima parada ainda pendente/em andamento (menor sequence).' })
  isNextStop!: boolean;

  @ApiProperty({ nullable: true, description: 'TripDeliveryStop.plannedArrival, sem alteracao (Fase 88).' })
  plannedArrival!: Date | null;

  @ApiProperty({ nullable: true, description: 'Previsao calculada nesta consulta -- NUNCA persistida.' })
  estimatedArrival!: Date | null;

  @ApiProperty({ enum: ['GEOGRAPHIC', 'DELAY_SHIFT', 'NONE'] })
  source!: TripEtaSource;

  @ApiProperty({ nullable: true, description: 'Explicacao textual de como estimatedArrival foi calculado.' })
  basis!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'estimatedArrival - plannedArrival, em segundos. Positivo = atraso previsto.',
  })
  varianceSeconds!: number | null;

  @ApiProperty({ nullable: true, description: 'true quando varianceSeconds > 0. Null quando nao computavel.' })
  delayed!: boolean | null;

  @ApiProperty({ nullable: true, description: 'Motivo pelo qual estimatedArrival ficou null.' })
  limitation!: string | null;
}

export class TripEtaResultEntity {
  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty()
  generatedAt!: Date;

  @ApiProperty({ format: 'uuid', nullable: true })
  nextStopId!: string | null;

  @ApiProperty({ nullable: true })
  tripPlannedArrival!: Date | null;

  @ApiProperty({ nullable: true, description: 'Previsao calculada para o destino final da viagem.' })
  tripEstimatedArrival!: Date | null;

  @ApiProperty({ enum: ['GEOGRAPHIC', 'DELAY_SHIFT', 'NONE'] })
  tripEstimatedArrivalSource!: TripEtaSource;

  @ApiProperty({ nullable: true })
  tripEstimatedArrivalBasis!: string | null;

  @ApiProperty({ nullable: true })
  tripVarianceSeconds!: number | null;

  @ApiProperty({ nullable: true })
  tripDelayed!: boolean | null;

  @ApiProperty({ type: TripDeliveryStopEtaEntity, isArray: true })
  stops!: TripDeliveryStopEtaEntity[];

  @ApiProperty({ type: String, isArray: true })
  limitations!: string[];
}
