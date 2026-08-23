import { ApiProperty } from '@nestjs/swagger';
import { TripOccurrenceSeverity, TripOccurrenceType } from '@prisma/client';
import { DashboardChartPointEntity } from '../../dashboard/entities/dashboard-charts.entity';
import { FleetVehicleRankingEntryEntity } from './fleet-vehicle-ranking-entry.entity';

export class FleetOccurrenceTypeCountEntity {
  @ApiProperty({ enum: TripOccurrenceType })
  type!: TripOccurrenceType;

  @ApiProperty()
  count!: number;
}

export class FleetOccurrenceSeverityCountEntity {
  @ApiProperty({ enum: TripOccurrenceSeverity })
  severity!: TripOccurrenceSeverity;

  @ApiProperty()
  count!: number;
}

export class FleetOccurrenceDriverRankingEntryEntity {
  @ApiProperty({ format: 'uuid' })
  driverId!: string;

  @ApiProperty()
  driverName!: string;

  @ApiProperty()
  count!: number;
}

// Fase 68 -- GET /fleet-operations/occurrences. status (open/resolved/
// cancelled) e SEMPRE derivado de resolvedAt/cancelledAt (TripOccurrence,
// Fase 67), nunca uma coluna propria -- mesmo principio ja usado em todo o
// modulo trip-operations. Contagens/rankings respeitam os filtros de
// FindFleetOccurrencesQueryDto (from/to aplicados sobre occurredAt);
// monthlyTrend SEMPRE cobre a janela fixa dos ultimos 12 meses (mesmo
// padrao de FleetStopsDashboardEntity/FleetFuelAnalyticsEntity, ignora
// from/to do filtro).
export class FleetOccurrencesDashboardEntity {
  @ApiProperty()
  totalCount!: number;

  @ApiProperty({ description: 'status OPEN (resolvedAt e cancelledAt nulos).' })
  openCount!: number;

  @ApiProperty({ description: 'status OPEN e severity CRITICAL.' })
  criticalOpenCount!: number;

  @ApiProperty({ description: 'status RESOLVED (resolvedAt preenchido, cancelledAt nulo).' })
  resolvedCount!: number;

  @ApiProperty({ description: 'status CANCELLED (cancelledAt preenchido).' })
  cancelledCount!: number;

  @ApiProperty({ type: [FleetOccurrenceTypeCountEntity] })
  byType!: FleetOccurrenceTypeCountEntity[];

  @ApiProperty({ type: [FleetOccurrenceSeverityCountEntity] })
  bySeverity!: FleetOccurrenceSeverityCountEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value" e "count" sao o mesmo numero aqui (contagem de ocorrencias).' })
  byVehicle!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [FleetOccurrenceDriverRankingEntryEntity] })
  byDriver!: FleetOccurrenceDriverRankingEntryEntity[];

  @ApiProperty({ type: [DashboardChartPointEntity], description: 'Ultimos 12 meses, por occurredAt.' })
  monthlyTrend!: DashboardChartPointEntity[];
}
