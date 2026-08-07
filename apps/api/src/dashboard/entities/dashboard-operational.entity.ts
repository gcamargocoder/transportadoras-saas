import { ApiProperty } from '@nestjs/swagger';

// todayTrips/lateTrips/tripsInProgress/completedToday sao metricas de
// ESTADO ATUAL ("hoje"/"agora") -- nao respeitam startDate/endDate (ver
// DashboardService). kmDriven/averageTripDistance respeitam o filtro de
// periodo, somando TripMetrics.actualDistanceKm (executado real).
export class DashboardOperationalEntity {
  @ApiProperty({ description: 'Viagens com plannedDeparture hoje.' })
  todayTrips!: number;

  @ApiProperty({ description: 'Viagens com plannedArrival no passado e status nao finalizado.' })
  lateTrips!: number;

  @ApiProperty()
  tripsInProgress!: number;

  @ApiProperty({ description: 'Viagens concluidas (actualArrival) hoje.' })
  completedToday!: number;

  @ApiProperty({ description: 'Soma de TripMetrics.actualDistanceKm no periodo/filtro.' })
  kmDriven!: number;

  @ApiProperty()
  averageTripDistance!: number;
}
