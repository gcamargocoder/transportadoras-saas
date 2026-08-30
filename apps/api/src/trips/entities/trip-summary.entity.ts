import { ApiProperty } from '@nestjs/swagger';
import { ChecklistExecutionStatus, TripStatus } from '@prisma/client';
import { TripOperationDeliverySummaryEntity } from './trip-operation.entity';

// GET /trips/:id/summary -- visao consolidada, reaproveitando dados ja
// existentes em Trip + TripMetrics + TollTransaction (nenhum dado novo
// persistido, apenas agregado para leitura).
export class TripSummaryEntity {
  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ enum: TripStatus })
  status!: TripStatus;

  @ApiProperty({ format: 'uuid', nullable: true })
  driverId!: string | null;

  @ApiProperty({ nullable: true })
  driverName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  vehicleId!: string | null;

  @ApiProperty({ nullable: true })
  vehiclePlate!: string | null;

  @ApiProperty()
  originName!: string;

  @ApiProperty()
  destinationName!: string;

  @ApiProperty({ nullable: true })
  plannedDeparture!: Date | null;

  @ApiProperty({ nullable: true })
  plannedArrival!: Date | null;

  @ApiProperty({ nullable: true })
  actualDeparture!: Date | null;

  @ApiProperty({ nullable: true })
  actualArrival!: Date | null;

  @ApiProperty({ nullable: true, description: 'Duracao em minutos (executada, senao prevista).' })
  durationMinutes!: number | null;

  @ApiProperty({ nullable: true, description: 'Distancia em km (executada, senao prevista).' })
  distanceKm!: number | null;

  @ApiProperty({ description: 'Quantidade de transacoes de pedagio registradas na viagem.' })
  tollTransactionsCount!: number;

  @ApiProperty({ description: 'Soma dos valores de pedagio cobrados na viagem.' })
  tollTransactionsTotal!: number;

  @ApiProperty({ nullable: true })
  plannedTotalCost!: number | null;

  @ApiProperty({ nullable: true })
  actualTotalCost!: number | null;

  // Fase 112 -- resumo de prontidao para liberar/iniciar a viagem
  // (planejamento). Nunca bloqueia nada aqui -- so REFLETE os mesmos
  // criterios ja aplicados por TripsService.assertCanStart (chamado de
  // verdade quando a viagem tenta iniciar); esta view e so leitura.
  // Fase 116 -- so avaliado enquanto a viagem ainda nao partiu (mesmo
  // criterio de assertTripPlanningAllowed); depois da partida (ou em
  // CANCELLED), fica sempre true/null (nao ha mais "iniciar" a considerar,
  // nunca mais chamado assertCanStart) -- antes desta correcao, uma viagem
  // ja concluida podia mostrar um motivo de bloqueio irrelevante (ex: "o
  // motorista ja esta em outra viagem", so porque ele foi despachado de
  // novo depois).
  @ApiProperty({
    description:
      'True quando iniciar a viagem agora (PATCH /trips/:id/status para IN_PROGRESS) passaria em ' +
      'todas as validacoes de assertCanStart (motorista/veiculo disponiveis, checklist pre-viagem ' +
      'quando exigido pelo tenant). Sempre true depois que a viagem ja partiu (nada mais a validar).',
  })
  readyToStart!: boolean;

  @ApiProperty({ nullable: true, description: 'Motivo pelo qual readyToStart=false (mesma mensagem que assertCanStart lancaria).' })
  notReadyReason!: string | null;

  @ApiProperty({ description: 'A viagem tem uma composicao (veiculo/carreta) vinculada.' })
  hasComposition!: boolean;

  @ApiProperty({ description: 'A viagem tem uma rota calculada (RoutingService) selecionada como atual.' })
  routePlanComputed!: boolean;

  @ApiProperty({
    description:
      'TripMetrics.planned* ja foi preenchido (manualmente ou via POST .../metrics/sync-from-route) -- ' +
      'nunca inventa um valor quando false.',
  })
  plannedMetricsSynced!: boolean;

  @ApiProperty({ description: 'TenantSettings.preferences.requirePreTripChecklist esta ativo para este tenant.' })
  preTripChecklistRequired!: boolean;

  @ApiProperty({ enum: ChecklistExecutionStatus, nullable: true, description: 'Status do checklist PRE_TRIP mais recente desta viagem.' })
  preTripChecklistStatus!: ChecklistExecutionStatus | null;

  @ApiProperty({ description: 'Mesma hasCriticalNonConformity ja usada em GET /checklists/executions.' })
  preTripChecklistHasCriticalNonConformity!: boolean;

  @ApiProperty({
    nullable: true,
    description: 'Peso previsto da carga (TripFreight.calculationInput.weightKg, quando o frete ja foi precificado para esta viagem).',
  })
  plannedWeightKg!: number | null;

  @ApiProperty({ nullable: true, description: 'Vehicle.cargoCapacityKg do veiculo vinculado, quando cadastrado.' })
  vehicleCapacityKg!: number | null;

  @ApiProperty({
    nullable: true,
    description:
      'plannedWeightKg <= vehicleCapacityKg. Null quando um dos dois valores nao esta disponivel -- nunca ' +
      'inventa uma comparacao sem os 2 dados reais.',
  })
  withinCapacity!: boolean | null;

  // Fase 116 -- consolidacao do FECHAMENTO da viagem (companheiro dos
  // campos de planejamento acima). Puramente informativo -- NUNCA bloqueia
  // a conclusao da viagem (PATCH /trips/:id/status para COMPLETED continua
  // sem nenhuma trava nova); so reaproveita os MESMOS dados/formula ja
  // usados na Torre de Controle (TripOperationEntity.deliverySummary/
  // openOccurrencesCount/criticalOpenOccurrencesCount, Fase 105), agora
  // tambem disponiveis para viagens TERMINADAS (a Torre de Controle so
  // cobre viagens ativas).
  @ApiProperty({ type: TripOperationDeliverySummaryEntity })
  deliverySummary!: TripOperationDeliverySummaryEntity;

  @ApiProperty({ description: 'TripOccurrence em aberto (resolvedAt/cancelledAt nulos), qualquer severidade.' })
  openOccurrencesCount!: number;

  @ApiProperty({ description: 'TripOccurrence em aberto (resolvedAt/cancelledAt nulos) com severity=CRITICAL.' })
  criticalOpenOccurrencesCount!: number;
}
