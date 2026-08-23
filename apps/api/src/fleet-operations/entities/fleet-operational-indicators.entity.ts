import { ApiProperty } from '@nestjs/swagger';
import { FleetVehicleRankingEntryEntity } from './fleet-vehicle-ranking-entry.entity';

// Fase 41 -- KPIs operacionais (secao H do pedido). averageTripDurationMinutes
// usa TripMetrics.actualDurationMin (gravado de verdade no fechamento da
// viagem, ver TripsService) -- nunca TripMetrics.actualDistanceKm (jamais
// escrito por nenhum service, confirmado na auditoria; por isso nao ha
// "km rodados"/"custo por km" aqui, ver docs/fleet-operations-dashboard.md).
export class FleetOperationalIndicatorsEntity {
  @ApiProperty()
  completedTrips!: number;

  @ApiProperty({ description: 'Viagens IN_PROGRESS ou PAUSED.' })
  inProgressTrips!: number;

  @ApiProperty()
  cancelledTrips!: number;

  @ApiProperty({ description: 'Fase 66 -- status PLANNED (planejamento, ainda nao despachada).' })
  plannedTrips!: number;

  @ApiProperty({ description: 'Fase 66 -- status WAITING_DRIVER (despachada, aguardando motorista chegar).' })
  waitingDriverTrips!: number;

  @ApiProperty({ description: 'Fase 66 -- status WAITING_DEPARTURE (motorista/veiculo prontos, aguardando saida).' })
  waitingDepartureTrips!: number;

  @ApiProperty({ description: 'Fase 66 -- status PAUSED isolado (subconjunto de inProgressTrips, que combina IN_PROGRESS+PAUSED).' })
  pausedTrips!: number;

  @ApiProperty({
    description:
      'Fase 66 -- viagens nao finalizadas (PLANNED/WAITING_DRIVER/WAITING_DEPARTURE/IN_PROGRESS/PAUSED) sem motorista vinculado.',
  })
  tripsWithoutDriver!: number;

  @ApiProperty({
    description:
      'Fase 66 -- viagens nao finalizadas sem composicao (veiculo) vinculada.',
  })
  tripsWithoutVehicle!: number;

  @ApiProperty({
    description:
      'Fase 66 -- viagens nao finalizadas com Trip.plannedArrival no passado (unica base temporal confiavel disponivel -- ' +
      'nunca uma estimativa de ETA). Zero quando nenhuma viagem do escopo tem plannedArrival preenchido.',
  })
  delayedTrips!: number;

  @ApiProperty({ nullable: true, description: 'Media de TripMetrics.actualDurationMin, so viagens concluidas com o dado gravado.' })
  averageTripDurationMinutes!: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Custo total do periodo/filtro dividido pela quantidade de viagens concluidas no mesmo escopo (aproximacao -- nem todo custo tem tripId).',
  })
  averageCostPerTrip!: number | null;

  @ApiProperty({
    nullable: true,
    description:
      'Soma de TripMetrics.actualDurationMin dividida pela duracao do periodo informado (minutos). Null quando startDate/endDate nao sao ambos informados (sem periodo de referencia confiavel).',
  })
  utilizationPercent!: number | null;

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value" e "count" = nº de viagens concluidas do veiculo.' })
  topVehiclesByTripCount!: FleetVehicleRankingEntryEntity[];
}
