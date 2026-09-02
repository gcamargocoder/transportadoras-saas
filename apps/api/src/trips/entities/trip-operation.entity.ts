import { ApiProperty } from '@nestjs/swagger';
import {
  AlertSeverity,
  AlertType,
  ChecklistExecutionStatus,
  TripLoadStatus,
  TripPriority,
  TripStatus,
} from '@prisma/client';
import { MaintenancePlanEvaluationStatus } from '../../fleet-operations/utils/maintenance-plan-status.util';
import { ReconciliationStatus } from '../../toll-routes/utils/toll-reconciliation.util';
import { LocationFreshness, MovementStatus, OperationalStatus } from '../utils/operational-status.util';

// Fase 29 -- ultima posicao conhecida (TrackingPoint), sem nenhum dado
// inventado: quando o campo nao existe no TrackingPoint (ex: precisao), ele
// simplesmente nao aparece aqui.
export class TripOperationPositionEntity {
  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiProperty()
  recordedAt!: Date;

  @ApiProperty({ nullable: true })
  speedKmh!: number | null;

  @ApiProperty({ nullable: true })
  headingDeg!: number | null;
}

// Resumo de pedagios (Fase 22/23/26) -- contagens apenas; o detalhe completo
// (por praca) continua nas abas ja existentes (Pedagios/Conciliacao) da
// pagina da viagem, nunca duplicado aqui.
export class TripOperationTollSummaryEntity {
  @ApiProperty({ description: 'Quantidade de pracas previstas pela rota (RoutePlanToll/TollRoute).' })
  plannedCount!: number;

  @ApiProperty({ description: 'Quantidade de TollTransaction ja registradas nesta viagem.' })
  registeredCount!: number;

  @ApiProperty({ description: 'Pracas previstas que ainda nao tiveram passagem registrada.' })
  pendingCount!: number;

  @ApiProperty({ description: 'TollTransaction registradas fora da rota prevista.' })
  unplannedCount!: number;

  @ApiProperty({ enum: ['PENDING', 'CONFORM', 'ATTENTION', 'CRITICAL', 'UNVERIFIABLE'] })
  reconciliationStatus!: ReconciliationStatus;
}

export class TripOperationAlertEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: AlertType })
  type!: AlertType;

  @ApiProperty({ enum: AlertSeverity })
  severity!: AlertSeverity;

  @ApiProperty()
  message!: string;

  @ApiProperty()
  createdAt!: Date;
}

// Fase 105 -- resumo das paradas/entregas planejadas (TripDeliveryStop,
// Fase 88/99) desta viagem, para a Torre de Controle. Mesma agregacao ja
// usada por FleetOperationsMetricsService/EmptyTripsService
// (buildDeliveryStopCountsByTrip) -- nunca uma segunda formula.
export class TripOperationDeliverySummaryEntity {
  @ApiProperty()
  totalCount!: number;

  @ApiProperty()
  pendingCount!: number;

  @ApiProperty()
  inProgressCount!: number;

  @ApiProperty()
  completedCount!: number;

  @ApiProperty()
  failedCount!: number;

  @ApiProperty()
  cancelledCount!: number;
}

// GET /trips/operations/active -- uma linha por viagem nao terminada
// (PLANNED..PAUSED), pensada para o painel de monitoramento (Fase 29).
// Deliberadamente enxuta: nenhum historico completo (TrackingPoints,
// TollTransactions, AuditLog inteiros) trafega aqui -- ver TripsService.
export class TripOperationEntity {
  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ enum: TripStatus, description: 'Ciclo de vida da viagem (nao muda com o Fase 29).' })
  status!: TripStatus;

  @ApiProperty({
    enum: ['MOVING', 'STOPPED', 'STALE', 'OFF_ROUTE', 'PAUSED', 'COMPLETED', 'UNKNOWN'],
    description: 'Situacao ATUAL, derivada a cada consulta -- nunca persistida, distinta de status.',
  })
  operationalStatus!: OperationalStatus;

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

  // Fase D -- carga REAL informada na largada (nunca inferida).
  @ApiProperty({ enum: TripLoadStatus, nullable: true, description: 'Trip.loadStatus -- carregado/vazio real da largada.' })
  loadStatus!: TripLoadStatus | null;

  // Fase D -- INTENCAO de carga do planejamento administrativo. Distinta de
  // loadStatus; nunca confundir planejado com realizado.
  @ApiProperty({ enum: TripLoadStatus, nullable: true, description: 'Trip.plannedLoadStatus -- intencao de carga do planejamento.' })
  plannedLoadStatus!: TripLoadStatus | null;

  // Fase D -- viagem de IDA vinculada (vinculo explicito). Null quando esta
  // viagem nao foi marcada como retorno de outra.
  @ApiProperty({ format: 'uuid', nullable: true, description: 'Trip.previousTripId -- ida que originou este retorno.' })
  previousTripId!: string | null;

  @ApiProperty({ nullable: true })
  actualDeparture!: Date | null;

  @ApiProperty({ nullable: true })
  initialOdometerKm!: number | null;

  @ApiProperty({ nullable: true })
  currentOdometerKm!: number | null;

  @ApiProperty({ type: TripOperationPositionEntity, nullable: true })
  lastPosition!: TripOperationPositionEntity | null;

  @ApiProperty({
    nullable: true,
    description: 'Minutos desde a ultima posicao conhecida (null quando nunca houve nenhuma).',
  })
  minutesSinceLastUpdate!: number | null;

  @ApiProperty({
    enum: ['ONLINE', 'STALE', 'OFFLINE'],
    description:
      'Classificacao da localizacao (secao 4): ONLINE = atualizacao recente; STALE = acima do ' +
      'limiar operacional; OFFLINE = nunca houve posicao ou esta muito desatualizada.',
  })
  locationFreshness!: LocationFreshness;

  @ApiProperty({ enum: ['MOVING', 'STOPPED', 'UNKNOWN'] })
  movementStatus!: MovementStatus;

  @ApiProperty()
  hasUnresolvedDeviation!: boolean;

  @ApiProperty({ description: 'Houve pelo menos um recalculo de rota (RoutePlan novo) nesta viagem.' })
  hasRecalculatedRoute!: boolean;

  @ApiProperty({ format: 'uuid', nullable: true })
  routePlanId!: string | null;

  @ApiProperty({ nullable: true })
  defaultAxles!: number | null;

  @ApiProperty({ type: TripOperationTollSummaryEntity })
  tollSummary!: TripOperationTollSummaryEntity;

  @ApiProperty({ type: TripOperationAlertEntity, isArray: true })
  alerts!: TripOperationAlertEntity[];

  // Fase 105 -- Torre de Controle: entregas, ocorrencias criticas e atraso.
  // Todos calculados em lote (IN tripIds), nunca uma consulta por viagem --
  // ver TripsService.getActiveOperations.
  @ApiProperty({ type: TripOperationDeliverySummaryEntity })
  deliverySummary!: TripOperationDeliverySummaryEntity;

  @ApiProperty({ description: 'TripOccurrence em aberto (resolvedAt/cancelledAt nulos), qualquer severidade.' })
  openOccurrencesCount!: number;

  @ApiProperty({ description: 'TripOccurrence em aberto (resolvedAt/cancelledAt nulos) com severity=CRITICAL.' })
  criticalOpenOccurrencesCount!: number;

  @ApiProperty({ nullable: true })
  plannedArrival!: Date | null;

  @ApiProperty({
    description:
      'plannedArrival no passado e a viagem ainda nao terminou -- mesmo criterio ja usado por ' +
      'FleetOperationsMetricsService (delayedTrips), nunca uma segunda regra de atraso.',
  })
  isDelayed!: boolean;

  // Fase 111 -- checklist PRE_TRIP mais recente desta viagem, para a Torre
  // de Controle. Calculado em lote (IN tripIds, 1 query), nunca 1 por
  // viagem -- ver TripsService.getActiveOperations.
  @ApiProperty({
    enum: ChecklistExecutionStatus,
    nullable: true,
    description: 'Status do checklist PRE_TRIP mais recente desta viagem. Null quando nenhum foi iniciado.',
  })
  preTripChecklistStatus!: ChecklistExecutionStatus | null;

  @ApiProperty({
    description:
      'Checklist PRE_TRIP mais recente COMPLETED tem item critico+obrigatorio respondido NAO ' +
      '(mesma hasCriticalNonConformity ja usada em GET /checklists/executions). False quando nao ha ' +
      'checklist ou ainda nao foi concluido.',
  })
  preTripChecklistHasCriticalNonConformity!: boolean;

  // Fase 114 -- Torre de Controle: prioridade real da viagem (Trip.priority,
  // definida no planejamento -- nunca inferida/calculada aqui) e risco de
  // manutencao do veiculo vinculado.
  @ApiProperty({ enum: TripPriority, description: 'Trip.priority, definida no planejamento da viagem.' })
  priority!: TripPriority;

  @ApiProperty({
    enum: ['OK', 'DUE_SOON', 'OVERDUE', 'UNKNOWN'],
    description:
      'Pior status entre os MaintenancePlan ativos do veiculo desta viagem (evaluateMaintenancePlan, ' +
      'mesma funcao pura ja usada no dashboard de manutencao da frota e nas notificacoes de plano ' +
      'vencido -- nunca uma segunda regra). UNKNOWN quando a viagem nao tem veiculo vinculado, o ' +
      'veiculo nao tem nenhum plano ativo, ou nenhum plano tem historico de servico concluido para ' +
      'calcular a partir.',
  })
  maintenanceStatus!: MaintenancePlanEvaluationStatus;
}

export class TripOperationsListEntity {
  @ApiProperty({ type: TripOperationEntity, isArray: true })
  items!: TripOperationEntity[];
}
