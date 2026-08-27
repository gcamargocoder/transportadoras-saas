import { ApiProperty } from '@nestjs/swagger';
import { TripOccurrenceSeverity, TripOccurrenceType } from '@prisma/client';

export class DeliveryOccurrenceTypeCountEntity {
  @ApiProperty({ enum: TripOccurrenceType })
  type!: TripOccurrenceType;

  @ApiProperty()
  count!: number;
}

export class DeliveryOccurrenceSeverityCountEntity {
  @ApiProperty({ enum: TripOccurrenceSeverity })
  severity!: TripOccurrenceSeverity;

  @ApiProperty()
  count!: number;
}

// Fase 101 -- indicadores da listagem de ocorrencias de entrega (mesmos
// filtros de FindDeliveryOccurrencesQueryDto exceto status, que nao faz
// sentido aqui: este endpoint PRODUZ a contagem por status).
export class DeliveryOccurrencesDashboardEntity {
  @ApiProperty()
  totalCount!: number;

  @ApiProperty()
  openCount!: number;

  @ApiProperty()
  inProgressCount!: number;

  @ApiProperty()
  resolvedCount!: number;

  @ApiProperty()
  cancelledCount!: number;

  @ApiProperty({ description: 'severity=CRITICAL e ainda nao resolvida/cancelada -- mesmo criterio de isCriticalOpenOccurrence.' })
  criticalOpenCount!: number;

  @ApiProperty({ type: [DeliveryOccurrenceSeverityCountEntity] })
  bySeverity!: DeliveryOccurrenceSeverityCountEntity[];

  @ApiProperty({ type: [DeliveryOccurrenceTypeCountEntity] })
  byType!: DeliveryOccurrenceTypeCountEntity[];
}
