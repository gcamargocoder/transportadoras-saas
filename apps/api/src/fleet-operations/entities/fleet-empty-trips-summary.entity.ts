import { ApiProperty } from '@nestjs/swagger';

// Fase 92 -- resumo de viagens vazias para o dashboard operacional.
// Reaproveita a MESMA regra de identificacao/classificacao de
// apps/api/src/trips/utils/empty-trip.util.ts (nunca uma segunda versao) --
// so agrega em vez de listar. Nunca inclui viagens que nao partiram
// (Trip.actualDeparture null): loadStatus so existe apos a largada, entao
// "unknownLoadStatusCount" so soma viagens que JA partiram mas o motorista
// nao informou carregado/vazio -- nunca viagens ainda em planejamento.
export class FleetEmptyTripsReasonBreakdownEntity {
  @ApiProperty({
    enum: ['NO_DELIVERIES_PLANNED', 'ALL_DELIVERIES_CANCELLED', 'DELIVERIES_INCOMPLETE', 'COMPLETED_DELIVERIES_INCONSISTENT'],
  })
  reason!: string;

  @ApiProperty()
  count!: number;
}

export class FleetEmptyTripsSummaryEntity {
  @ApiProperty({ description: 'Viagens que ja partiram (actualDeparture preenchido) no periodo/filtro.' })
  totalDepartedTrips!: number;

  @ApiProperty({ description: 'loadStatus = LOADED.' })
  loadedCount!: number;

  @ApiProperty({ description: 'loadStatus = EMPTY -- a definicao adotada de "viagem vazia".' })
  emptyCount!: number;

  @ApiProperty({
    description:
      'Viagens que ja partiram mas loadStatus nunca foi informado -- AUSENCIA DE DADO, nunca contada como vazia nem como carregada.',
  })
  unknownLoadStatusCount!: number;

  @ApiProperty({
    nullable: true,
    description:
      'emptyCount / (loadedCount + emptyCount) * 100. Exclui unknownLoadStatusCount do denominador de proposito -- ' +
      'nao ha como saber se uma viagem sem dado informado seria vazia ou nao (regra 3). Null quando o denominador e 0.',
  })
  emptyPercent!: number | null;

  @ApiProperty({ type: FleetEmptyTripsReasonBreakdownEntity, isArray: true })
  reasonBreakdown!: FleetEmptyTripsReasonBreakdownEntity[];

  @ApiProperty({ nullable: true, description: 'Soma de TripMetrics.actualDistanceKm das viagens vazias -- null se nenhuma tem o dado.' })
  totalDistanceKm!: number | null;

  @ApiProperty({ nullable: true, description: 'Soma de TripMetrics.actualTotalCost das viagens vazias -- null se nenhuma tem o dado.' })
  totalCost!: number | null;

  @ApiProperty({ description: 'Quantas das viagens vazias tem distancia calculada (denominador real de totalDistanceKm).' })
  tripsWithDistanceCount!: number;

  @ApiProperty({ description: 'Quantas das viagens vazias tem custo calculado (denominador real de totalCost).' })
  tripsWithCostCount!: number;
}
