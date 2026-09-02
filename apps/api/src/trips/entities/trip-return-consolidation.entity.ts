import { ApiProperty } from '@nestjs/swagger';
import { TripLoadStatus, TripStatus } from '@prisma/client';
import { TripFinancialResultEntity } from '../../trip-settlements/entities/trip-financial-result.entity';

// GET /trips/:id/return-consolidation -- Fase E: visao DERIVADA e
// somente-leitura que consolida uma viagem de IDA e a(s) sua(s) viagem(ns)
// de RETORNO usando EXCLUSIVAMENTE Trip.previousTripId (vinculo explicito da
// Fase D).
//
// NAO e um agrupador persistido. NAO cria Operation/roundTrip. Cada Trip
// continua sendo a fonte de verdade dos seus proprios dados: o financeiro
// por perna e EXATAMENTE TripSettlementsService.getFinancialResult (mesma
// regra de custo/receita/margem, nenhum motor financeiro novo), e o
// agregado e apenas uma SOMA em memoria dos valores que ja existem -- nunca
// inventa 0, nunca infere carga, nunca faz join com fan-out.

export class ConsolidatedLegEntity {
  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({
    enum: ['OUTBOUND', 'RETURN'],
    description: 'OUTBOUND = a viagem de ida consultada; RETURN = viagem vinculada a ela por previousTripId.',
  })
  role!: 'OUTBOUND' | 'RETURN';

  @ApiProperty({ enum: TripStatus })
  status!: TripStatus;

  @ApiProperty()
  originName!: string;

  @ApiProperty()
  destinationName!: string;

  @ApiProperty({ nullable: true })
  plannedDeparture!: Date | null;

  @ApiProperty({ nullable: true })
  actualDeparture!: Date | null;

  @ApiProperty({ nullable: true })
  actualArrival!: Date | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Trip.previousTripId desta perna. No OUTBOUND, != null indica que a viagem consultada e, ela propria, o retorno de outra.',
  })
  previousTripId!: string | null;

  @ApiProperty({
    enum: TripLoadStatus,
    nullable: true,
    description: 'Trip.loadStatus -- carga REAL informada pelo motorista na largada. Nunca inferida.',
  })
  loadStatus!: TripLoadStatus | null;

  @ApiProperty({
    enum: TripLoadStatus,
    nullable: true,
    description: 'Trip.plannedLoadStatus -- intencao de carga do planejamento. Apenas informativo; nunca alimenta loadCondition.',
  })
  plannedLoadStatus!: TripLoadStatus | null;

  @ApiProperty({
    enum: ['LOADED', 'EMPTY', 'UNKNOWN'],
    description:
      'Condicao de carga derivada EXCLUSIVAMENTE de loadStatus REAL: LOADED/EMPTY quando informado na ' +
      'largada, UNKNOWN quando ainda nao informado. plannedLoadStatus NUNCA entra aqui.',
  })
  loadCondition!: 'LOADED' | 'EMPTY' | 'UNKNOWN';

  @ApiProperty({
    type: TripFinancialResultEntity,
    description: 'Resultado financeiro individual da perna -- IDENTICO a GET /trips/:id/financial-result (mesma regra, nunca recalculado aqui).',
  })
  financialResult!: TripFinancialResultEntity;
}

export class TripReturnConsolidationEntity {
  @ApiProperty({ format: 'uuid', description: 'tripId da viagem de IDA consultada.' })
  outboundTripId!: string;

  @ApiProperty({ description: 'Total de pernas consideradas: 1 (ida) + retornos vinculados.' })
  legCount!: number;

  @ApiProperty({ description: 'Quantidade de viagens de RETORNO vinculadas por previousTripId (0 = ida sem retorno).' })
  returnLegCount!: number;

  @ApiProperty({ type: ConsolidatedLegEntity })
  outbound!: ConsolidatedLegEntity;

  @ApiProperty({ type: ConsolidatedLegEntity, isArray: true })
  returns!: ConsolidatedLegEntity[];

  @ApiProperty({
    nullable: true,
    description:
      'Soma de TripMetrics.actualDistanceKm APENAS das pernas CONCLUIDAS (status COMPLETED) que ja tem ' +
      'distancia real apurada. Null quando nenhuma perna qualifica -- nunca estimada.',
  })
  totalCompletedDistanceKm!: number | null;

  @ApiProperty({ description: 'Soma de financialResult.totalCost de todas as pernas (combustivel + pedagio + despesas APPROVED).' })
  totalCost!: number;

  @ApiProperty({
    nullable: true,
    description:
      'Soma de financialResult.contractedRevenue das pernas que TEM valor comercial. Null quando NENHUMA ' +
      'perna tem -- nunca somado como 0.',
  })
  totalContractedRevenue!: number | null;

  @ApiProperty({ description: 'Soma de financialResult.invoicedRevenue (TripBilling.invoicedAmount) de todas as pernas.' })
  totalInvoicedRevenue!: number;

  @ApiProperty({ description: 'Soma de financialResult.receivedRevenue (invoicedAmount quando TripBilling.status = PAID) de todas as pernas.' })
  totalReceivedRevenue!: number;

  @ApiProperty({
    nullable: true,
    description: 'totalContractedRevenue - totalCost. Null quando totalContractedRevenue indisponivel.',
  })
  consolidatedOperatingResult!: number | null;

  @ApiProperty({ description: 'totalInvoicedRevenue - totalCost.' })
  consolidatedInvoicedResult!: number;

  @ApiProperty({ description: 'totalReceivedRevenue - totalCost.' })
  consolidatedReceivedResult!: number;

  @ApiProperty({ description: 'Quantidade de pernas que tinham contractedRevenue disponivel.' })
  legsWithContractedRevenue!: number;

  @ApiProperty({
    description:
      'true quando TODAS as pernas tinham contractedRevenue -- quando false, consolidatedOperatingResult e ' +
      'PARCIAL (custo total x receita apenas de algumas pernas).',
  })
  revenueComplete!: boolean;
}
