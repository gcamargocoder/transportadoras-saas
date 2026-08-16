import { ApiProperty } from '@nestjs/swagger';
import { TrailerType } from '@prisma/client';
import { DashboardChartPointEntity } from '../../dashboard/entities/dashboard-charts.entity';

// Dashboard novo -- uso de veiculo+carreta por viagem. Auditoria confirmou:
// Trailer nao tem campo de eixo proprio (so existe em AxleConfiguration,
// 1:1 com TripComposition) e nao tem fleetId; TripStop nao tem trailerId
// (atribuicao de parada a carreta so via TripStop.tripId -> Trip.composition
// .trailers, nunca para paradas administrativas sem tripId); composicao com
// varias carretas (bitrem/rodotrem) atribui a duracao INTEIRA a cada carreta
// (nunca dividida). Ver docs/fleet-operations-dashboard.md, secao
// "Composicao", para o detalhamento completo dessas limitacoes.
export class FleetTrailerTypeBreakdownEntity {
  @ApiProperty({ enum: TrailerType })
  type!: TrailerType;

  @ApiProperty()
  count!: number;
}

// Agrupado por AxleConfiguration.billableCategory (categoria cobravel de
// pedagio) das composicoes vinculadas a viagens no escopo do filtro
// (qualquer status), nao das carretas isoladas -- eixo e atributo da
// composicao, nao da carreta.
export class FleetAxleCategoryBreakdownEntity {
  @ApiProperty()
  billableCategory!: string;

  @ApiProperty()
  totalAxles!: number;

  @ApiProperty()
  count!: number;
}

export class FleetTrailerRankingEntryEntity {
  @ApiProperty({ format: 'uuid' })
  trailerId!: string;

  @ApiProperty()
  plate!: string;

  @ApiProperty({ enum: TrailerType })
  type!: TrailerType;

  @ApiProperty()
  value!: number;

  @ApiProperty()
  count!: number;
}

// Tempo em uso (soma de TripMetrics.actualDurationMin de viagens concluidas
// atribuidas a esta carreta) vs. tempo parado (soma de TripStop.durationMinutes
// de paradas com tripId atribuiveis a esta carreta) -- nunca receita perdida
// aqui (ratear receita entre carretas da mesma composicao seria uma alocacao
// inventada, fora de escopo, ver docs).
export class FleetTrailerDowntimeEntity {
  @ApiProperty({ format: 'uuid' })
  trailerId!: string;

  @ApiProperty()
  plate!: string;

  @ApiProperty({ enum: TrailerType })
  type!: TrailerType;

  @ApiProperty({ description: 'Soma de TripMetrics.actualDurationMin das viagens concluidas atribuidas a esta carreta.' })
  inUseMinutes!: number;

  @ApiProperty({ description: 'Soma de TripStop.durationMinutes das paradas com tripId atribuiveis a esta carreta.' })
  downtimeMinutes!: number;

  @ApiProperty({ description: 'Numero de viagens concluidas atribuidas a esta carreta.' })
  tripCount!: number;
}

export class FleetCompositionsOverviewEntity {
  @ApiProperty()
  totalTrailers!: number;

  @ApiProperty({ description: 'Carretas com isActive=true.' })
  activeCount!: number;

  @ApiProperty({ description: 'Carretas com isActive=false.' })
  inactiveCount!: number;

  @ApiProperty({ description: 'Carretas ativas vinculadas a uma viagem IN_PROGRESS/PAUSED agora (subconjunto de activeCount).' })
  trailersOnTrip!: number;

  @ApiProperty({ description: 'activeCount - trailersOnTrip.' })
  trailersAvailable!: number;

  @ApiProperty({ type: [FleetTrailerTypeBreakdownEntity] })
  byType!: FleetTrailerTypeBreakdownEntity[];

  @ApiProperty({ type: [FleetAxleCategoryBreakdownEntity], description: 'Composicoes de viagens no escopo do filtro (periodo/veiculo/frota), qualquer status.' })
  axleCategoryBreakdown!: FleetAxleCategoryBreakdownEntity[];

  @ApiProperty({ type: [FleetTrailerRankingEntryEntity], description: '"value"="count" = numero de viagens concluidas.' })
  topTrailersByTripCount!: FleetTrailerRankingEntryEntity[];

  @ApiProperty({ type: [FleetTrailerRankingEntryEntity], description: '"value" = minutos em uso (TripMetrics.actualDurationMin somado).' })
  topTrailersByInUseMinutes!: FleetTrailerRankingEntryEntity[];

  @ApiProperty({ type: [FleetTrailerDowntimeEntity], description: 'Todas as carretas com pelo menos 1 viagem concluida ou 1 parada atribuivel no escopo.' })
  trailers!: FleetTrailerDowntimeEntity[];

  @ApiProperty({ type: [DashboardChartPointEntity], description: 'Ultimos 12 meses, sempre (ignora startDate/endDate). Numero de viagens concluidas com pelo menos 1 carreta na composicao, por mes.' })
  monthlyTrendTripCount!: DashboardChartPointEntity[];
}
