import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Alert,
  ChecklistExecutionStatus,
  ChecklistType,
  Prisma,
  RouteEventType,
  TrackingPoint,
  TripStatus,
  VehicleMaintenanceStatus,
  VehicleStatus,
} from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { compact } from '../../common/utils/compact.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { assertOdometerNotBelowVehicle, computeBumpedOdometer } from '../../common/utils/odometer.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { hasCriticalNonConformity } from '../../checklists/utils/checklist-non-conformity.util';
import { resolveVehicleAvailability } from '../../fleet/services/vehicle-availability.service';
import {
  evaluateMaintenancePlan,
  MaintenancePlanEvaluationStatus,
} from '../../fleet-operations/utils/maintenance-plan-status.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTripDto } from '../dto/create-trip.dto';
import { FindTripsQueryDto } from '../dto/find-trips-query.dto';
import { UpdateTripStatusDto } from '../dto/update-trip-status.dto';
import { UpdateTripDto } from '../dto/update-trip.dto';
import { PaginatedTripsEntity } from '../entities/paginated-trips.entity';
import { TripEntity } from '../entities/trip.entity';
import { TripSummaryEntity } from '../entities/trip-summary.entity';
import {
  TripOperationAlertEntity,
  TripOperationDeliverySummaryEntity,
  TripOperationEntity,
  TripOperationPositionEntity,
  TripOperationTollSummaryEntity,
  TripOperationsListEntity,
} from '../entities/trip-operation.entity';
import { toTripEntity, TripWithRelations } from '../mappers/trip.mapper';
import { toTripSummaryEntity } from '../mappers/trip-summary.mapper';
import { DEFAULT_STALE_THRESHOLD_MINUTES } from '../constants/monitoring.constants';
import { buildDeliveryStopCountsByTrip, EMPTY_DELIVERY_STOP_STATUS_COUNTS } from '../utils/empty-trip.util';
import {
  computeLocationFreshness,
  computeMovementStatus,
  computeOperationalStatus,
} from '../utils/operational-status.util';
import { resolveRequirePreTripChecklist } from '../utils/trip-preferences.util';
import { assertTripPlanningAllowed } from '../utils/trip-planning-lock.util';
import { TollRoutesService } from '../../toll-routes/services/toll-routes.service';
import { TollReconciliationService } from '../../toll-routes/services/toll-reconciliation.service';
import { TollReconciliationResult } from '../../toll-routes/utils/toll-reconciliation.util';
import { TripSettlementsService } from '../../trip-settlements/services/trip-settlements.service';
import { VehicleIdlePeriodsService } from '../../vehicle-idle-periods/services/vehicle-idle-periods.service';
import { CustomersService } from './customers.service';
import { LocationsService } from './locations.service';

const TRIP_INCLUDE = {
  customer: true,
  driver: true,
  origin: true,
  destination: true,
  composition: { include: { vehicle: true, axleConfiguration: true } },
  tollRoute: true,
  // Fase D -- dados MINIMOS da viagem de ida vinculada (vinculo explicito,
  // Trip.previousTripId). Nested SELECT (nao include) -- o Prisma resolve
  // como 1 query em lote por pagina (WHERE id IN (...)), nunca N+1. So
  // leitura; nunca carrega satelites financeiros/operacionais da ida.
  previousTrip: {
    select: {
      id: true,
      status: true,
      plannedDeparture: true,
      loadStatus: true,
      plannedLoadStatus: true,
      origin: { select: { name: true } },
      destination: { select: { name: true } },
    },
  },
} satisfies Prisma.TripInclude;

// Viagens ainda "em aberto" (nao concluidas/canceladas) -- usado tanto para
// bloquear exclusao de Driver/Vehicle (ver DriversService/VehiclesService)
// quanto para checagem de disponibilidade aqui. Exportado desde a Fase 90
// para FleetOptimizationService reaproveitar a MESMA lista na deteccao de
// conflito de agenda em lote -- nunca uma segunda lista divergente.
export const NON_TERMINAL_STATUSES: TripStatus[] = [
  TripStatus.PLANNED,
  TripStatus.WAITING_DRIVER,
  TripStatus.WAITING_DEPARTURE,
  TripStatus.IN_PROGRESS,
  TripStatus.PAUSED,
];

// Fluxo operacional: PLANNED (planejamento) -> WAITING_DRIVER (despachada,
// aguardando motorista chegar) -> WAITING_DEPARTURE (motorista/veiculo
// prontos, aguardando saida) -> IN_PROGRESS (na estrada) -> PAUSED (parada
// temporaria) -> COMPLETED. CANCELLED e alcancavel de qualquer estado nao
// terminal. Estagios intermediarios podem ser pulados (ex: PLANNED direto
// para IN_PROGRESS), mas nunca "andar para tras" exceto PAUSED -> IN_PROGRESS
// (retorno) -- nao ha "replanejamento" de volta a PLANNED.
const ALLOWED_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  PLANNED: [
    TripStatus.WAITING_DRIVER,
    TripStatus.WAITING_DEPARTURE,
    TripStatus.IN_PROGRESS,
    TripStatus.CANCELLED,
  ],
  WAITING_DRIVER: [TripStatus.WAITING_DEPARTURE, TripStatus.IN_PROGRESS, TripStatus.CANCELLED],
  WAITING_DEPARTURE: [TripStatus.IN_PROGRESS, TripStatus.CANCELLED],
  IN_PROGRESS: [TripStatus.PAUSED, TripStatus.COMPLETED, TripStatus.CANCELLED],
  PAUSED: [TripStatus.IN_PROGRESS, TripStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

// Nomes de acao de auditoria alinhados ao vocabulario da timeline pedido
// (Inicio, Pausa, Retorno, Chegada, Conclusao, Cancelamento...) -- em vez do
// generico "trip.status_changed" para toda transicao.
function resolveStatusChangeAction(from: TripStatus, to: TripStatus): string {
  switch (to) {
    case TripStatus.WAITING_DRIVER:
      return 'trip.waiting_driver';
    case TripStatus.WAITING_DEPARTURE:
      return 'trip.waiting_departure';
    case TripStatus.IN_PROGRESS:
      return from === TripStatus.PAUSED ? 'trip.resumed' : 'trip.started';
    case TripStatus.PAUSED:
      return 'trip.paused';
    case TripStatus.COMPLETED:
      return 'trip.completed';
    case TripStatus.CANCELLED:
      return 'trip.cancelled';
    default:
      return 'trip.status_changed';
  }
}

// Fase 112 -- extrai a mensagem de uma HttpException lancada por codigo
// nosso (ex: assertCanStart), mesmo padrao ja usado por
// AllExceptionsFilter.extractMessage -- nunca uma segunda logica de
// formatacao de erro.
function extractHttpMessage(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  if (response && typeof response === 'object' && 'message' in response) {
    const message = (response as { message: string | string[] }).message;
    return Array.isArray(message) ? message.join(' ') : message;
  }
  return exception.message;
}

// Fase 112 -- leitura defensiva de TripFreight.calculationInput (JSON
// livre, ver schema.prisma) -- nunca confia cegamente no formato.
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// calculationInput e sempre gravado via toJsonSafe (Decimal->number ja
// convertido antes de virar JSON, ver FreightPricingService) -- nunca um
// Prisma.Decimal aqui, so number|string|null cru de um JSON.
function extractJsonNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locationsService: LocationsService,
    private readonly customersService: CustomersService,
    private readonly tollRoutesService: TollRoutesService,
    private readonly tollReconciliationService: TollReconciliationService,
    private readonly tripSettlementsService: TripSettlementsService,
    private readonly idlePeriodsService: VehicleIdlePeriodsService,
  ) {}

  async findAll(tenantId: string, query: FindTripsQueryDto): Promise<PaginatedTripsEntity> {
    const where: Prisma.TripWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(query.vehicleId ? { composition: { vehicleId: query.vehicleId } } : {}),
      ...(query.originLocationId ? { originLocationId: query.originLocationId } : {}),
      ...(query.destinationLocationId
        ? { destinationLocationId: query.destinationLocationId }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.departureFrom || query.departureTo
        ? {
            plannedDeparture: {
              ...(query.departureFrom ? { gte: new Date(query.departureFrom) } : {}),
              ...(query.departureTo ? { lte: new Date(query.departureTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { notes: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              {
                customer: { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              },
              { origin: { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } } },
              {
                destination: {
                  name: { contains: query.search, mode: Prisma.QueryMode.insensitive },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        include: TRIP_INCLUDE,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.trip.count({ where }),
    ]);

    const result = new PaginatedTripsEntity();
    result.items = items.map(toTripEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<TripEntity> {
    return toTripEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  // GET /trips/:id/timeline -- evoluido na Fase 67 para TripTimelineService
  // (agrega TripStop/RouteEvent/FuelSupply/TollTransaction/AxleEvent/
  // ChecklistExecution/FiscalDocument/TripExpense/TripRevenue/
  // TripOccurrence/AuditLog numa projecao unica, nunca so AuditLog).

  // GET /trips/:id/summary -- visao consolidada (motorista, veiculo, origem,
  // destino, tempo, status, distancia, pedagios, custos), agregando dados ja
  // existentes (Trip + TripMetrics + TollTransaction) sem persistir nada novo.
  async getSummary(tenantId: string, id: string): Promise<TripSummaryEntity> {
    const trip = await this.findOwnedOrThrow(tenantId, id);

    const [
      metrics,
      tollAggregate,
      settings,
      mostRecentPreTripChecklist,
      tripFreight,
      deliveryStopRows,
      openOccurrencesCount,
      criticalOpenOccurrencesCount,
    ] = await Promise.all([
      this.prisma.tripMetrics.findUnique({ where: { tripId: id } }),
      this.prisma.tollTransaction.aggregate({
        where: { tenantId, tripId: id },
        _count: { _all: true },
        _sum: { chargedAmount: true },
      }),
      this.prisma.tenantSettings.findUnique({ where: { tenantId } }),
      this.prisma.checklistExecution.findFirst({
        where: { tenantId, tripId: id, template: { type: ChecklistType.PRE_TRIP } },
        orderBy: { startedAt: 'desc' },
        include: { answers: { include: { item: true } } },
      }),
      this.prisma.tripFreight.findFirst({ where: { tenantId, tripId: id }, select: { calculationInput: true } }),
      // Fase 116 -- consolidacao do fechamento: mesma agregacao de
      // TripDeliveryStop ja usada em getActiveOperations (Fase 105), agora
      // tambem para uma unica viagem (inclusive ja terminada).
      this.prisma.tripDeliveryStop.groupBy({
        by: ['tripId', 'status'],
        where: { tenantId, tripId: id },
        _count: true,
      }),
      this.prisma.tripOccurrence.count({ where: { tenantId, tripId: id, resolvedAt: null, cancelledAt: null } }),
      this.prisma.tripOccurrence.count({
        where: { tenantId, tripId: id, resolvedAt: null, cancelledAt: null, severity: 'CRITICAL' },
      }),
    ]);

    // Fase 112 -- reaproveita INTEGRALMENTE assertCanStart (nunca uma
    // segunda regra de "pode iniciar"): so captura o resultado em vez de
    // deixar a excecao propagar, ja que aqui e uma LEITURA (nunca a propria
    // transicao de status). Fase 116 -- so chamado enquanto a viagem ainda
    // nao partiu (mesmo criterio de assertTripPlanningAllowed): depois da
    // partida, assertCanStart avaliaria condicoes (motorista/veiculo
    // disponiveis AGORA) que nao tem mais nenhum sentido para uma viagem
    // que ja esta em andamento ou ja terminou -- e podiam produzir um
    // notReadyReason enganoso (ex: motorista despachado para OUTRA viagem
    // depois que esta ja tinha partido).
    let readyToStart = true;
    let notReadyReason: string | null = null;
    let isPreDeparture = true;
    try {
      assertTripPlanningAllowed(trip);
    } catch {
      isPreDeparture = false;
    }
    if (isPreDeparture) {
      try {
        await this.assertCanStart(tenantId, trip, id);
      } catch (error) {
        readyToStart = false;
        notReadyReason = error instanceof HttpException ? extractHttpMessage(error) : 'Nao e possivel iniciar a viagem.';
      }
    }

    const weightKg = isPlainRecord(tripFreight?.calculationInput)
      ? extractJsonNumber(tripFreight.calculationInput.weightKg)
      : null;

    const deliveryStopCounts =
      buildDeliveryStopCountsByTrip(deliveryStopRows).get(id) ?? EMPTY_DELIVERY_STOP_STATUS_COUNTS;

    return toTripSummaryEntity(trip, metrics, {
      count: tollAggregate._count._all,
      total: tollAggregate._sum.chargedAmount,
    }, {
      readyToStart,
      notReadyReason,
      routePlanComputed: trip.routePlanId !== null,
      plannedMetricsSynced: metrics !== null && metrics.plannedDistanceKm !== null,
      preTripChecklistRequired: resolveRequirePreTripChecklist(settings?.preferences),
      preTripChecklistStatus: mostRecentPreTripChecklist?.status ?? null,
      preTripChecklistHasCriticalNonConformity: mostRecentPreTripChecklist
        ? hasCriticalNonConformity(mostRecentPreTripChecklist.answers)
        : false,
      plannedWeightKg: weightKg,
      vehicleCapacityKg: toNumberOrNull(trip.composition?.vehicle.cargoCapacityKg ?? null),
      deliveryStopCounts,
      openOccurrencesCount,
      criticalOpenOccurrencesCount,
    });
  }

  // GET /trips/operations/active (Fase 29) -- painel de monitoramento
  // operacional: uma linha por viagem ainda nao terminada (PLANNED..PAUSED),
  // reaproveitando integralmente RoutePlan/RouteEvent/TrackingPoint/Alert/
  // TollReconciliationService ja existentes. Pensado para nunca fazer N
  // consultas por viagem: no maximo um punhado de queries (todas com
  // `IN tripIds`), independente de quantas viagens ativas existam.
  async getActiveOperations(tenantId: string): Promise<TripOperationsListEntity> {
    const trips = await this.prisma.trip.findMany({
      where: { tenantId, deletedAt: null, status: { in: NON_TERMINAL_STATUSES } },
      include: TRIP_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    const result = new TripOperationsListEntity();
    if (trips.length === 0) {
      result.items = [];
      return result;
    }
    const tripIds = trips.map((trip) => trip.id);
    // Fase 114 -- veiculos vinculados as viagens ativas (no maximo 1 por
    // viagem, ja que Vehicle so pode estar em UMA viagem ativa por vez --
    // regra ja garantida por assertVehicleAvailable). Usado so para escopar
    // a consulta de MaintenancePlan abaixo, nunca 1 query por veiculo.
    const vehicleIds = [
      ...new Set(trips.map((trip) => trip.composition?.vehicleId).filter((id): id is string => Boolean(id))),
    ];

    const [
      lastPoints,
      deviationEvents,
      tollSummaries,
      alerts,
      settings,
      deliveryStopRows,
      occurrenceRows,
      preTripChecklists,
      activeMaintenancePlans,
    ] = await Promise.all([
      // Uma linha por viagem: a leitura de TrackingPoint mais recente
      // (distinct + orderBy), nunca o historico inteiro.
      this.prisma.trackingPoint.findMany({
        where: { tenantId, tripId: { in: tripIds } },
        orderBy: { recordedAt: 'desc' },
        distinct: ['tripId'],
      }),
      this.prisma.routeEvent.findMany({
        where: { tenantId, tripId: { in: tripIds }, type: RouteEventType.DEVIATION },
      }),
      this.tollReconciliationService.getSummaries(tenantId, tripIds),
      this.prisma.alert.findMany({
        where: { tenantId, tripId: { in: tripIds }, acknowledgedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenantSettings.findUnique({ where: { tenantId } }),
      // Fase 105 -- Torre de Controle: resumo de entregas por viagem
      // (TripDeliveryStop, Fase 88/99), mesma agregacao ja usada por
      // FleetOperationsMetricsService/EmptyTripsService.
      this.prisma.tripDeliveryStop.groupBy({
        by: ['tripId', 'status'],
        where: { tenantId, tripId: { in: tripIds } },
        _count: true,
      }),
      // Fase 105 -- ocorrencias EM ABERTO por viagem (resolvedAt/cancelledAt
      // nulos), agrupadas por severidade -- mesmo criterio ja usado por
      // isCriticalOpenOccurrence/NotificationsService.collectCriticalOccurrences.
      this.prisma.tripOccurrence.groupBy({
        by: ['tripId', 'severity'],
        where: { tenantId, tripId: { in: tripIds }, resolvedAt: null, cancelledAt: null },
        _count: true,
      }),
      // Fase 111 -- Torre de Controle: checklist PRE_TRIP mais recente por
      // viagem. 1 query em lote (IN tripIds), nunca 1 por viagem. answers+item
      // trazidos para calcular hasCriticalNonConformity em memoria (mesma
      // funcao pura ja usada em ChecklistExecutionsService/NotificationsService).
      this.prisma.checklistExecution.findMany({
        where: { tenantId, tripId: { in: tripIds }, template: { type: ChecklistType.PRE_TRIP } },
        select: {
          tripId: true,
          status: true,
          startedAt: true,
          answers: { select: { booleanValue: true, item: { select: { type: true, required: true, critical: true } } } },
        },
        orderBy: { startedAt: 'desc' },
      }),
      // Fase 114 -- Torre de Controle: planos de manutencao preventiva ATIVOS
      // dos veiculos em viagem agora, escopados por IN vehicleIds (nunca o
      // catalogo inteiro do tenant, nunca 1 query por veiculo). Mesma fonte
      // ja usada por FleetOperationsMetricsService.computeMaintenancePlanStatus
      // e NotificationsService.collectMaintenancePlansDue -- nenhuma segunda
      // regra de vencimento.
      this.prisma.maintenancePlan.findMany({
        where: { tenantId, active: true, vehicleId: { in: vehicleIds } },
      }),
    ]);

    // Fase 114 -- segunda etapa (depende dos planIds acima, por isso fora do
    // Promise.all principal): ultima VehicleMaintenance COMPLETED por plano.
    // Mesmo padrao de 2 queries em lote ja usado nos 2 lugares citados acima
    // -- nunca 1 consulta por plano. Vehicle.odometerKm ja veio no TRIP_INCLUDE
    // (composition.vehicle), entao nao repete essa consulta aqui.
    const lastCompletedMaintenanceByPlan = new Map<string, { completedAt: Date | null; odometerKm: number | null }>();
    if (activeMaintenancePlans.length > 0) {
      const planIds = activeMaintenancePlans.map((plan) => plan.id);
      const lastCompletedRows = await this.prisma.vehicleMaintenance.findMany({
        where: { tenantId, maintenancePlanId: { in: planIds }, status: VehicleMaintenanceStatus.COMPLETED },
        select: { maintenancePlanId: true, completedAt: true, odometerKm: true },
        orderBy: { completedAt: 'desc' },
      });
      for (const row of lastCompletedRows) {
        if (!row.maintenancePlanId || lastCompletedMaintenanceByPlan.has(row.maintenancePlanId)) continue;
        lastCompletedMaintenanceByPlan.set(row.maintenancePlanId, {
          completedAt: row.completedAt,
          odometerKm: toNumberOrNull(row.odometerKm),
        });
      }
    }

    const lastPointByTrip = new Map(lastPoints.map((point) => [point.tripId, point]));
    const deviationsByTrip = new Map<string, typeof deviationEvents>();
    for (const event of deviationEvents) {
      const list = deviationsByTrip.get(event.tripId) ?? [];
      list.push(event);
      deviationsByTrip.set(event.tripId, list);
    }
    const alertsByTrip = new Map<string, typeof alerts>();
    for (const alert of alerts) {
      if (!alert.tripId) continue;
      const list = alertsByTrip.get(alert.tripId) ?? [];
      list.push(alert);
      alertsByTrip.set(alert.tripId, list);
    }
    const deliveryCountsByTrip = buildDeliveryStopCountsByTrip(deliveryStopRows);
    // Fase 111 -- so o mais recente por viagem (orderBy startedAt desc,
    // primeira ocorrencia vence), mesmo criterio de "instalacao mais
    // recente" ja usado em TiresService.findOne.
    const preTripChecklistByTrip = new Map<string, (typeof preTripChecklists)[number]>();
    for (const execution of preTripChecklists) {
      if (!execution.tripId || preTripChecklistByTrip.has(execution.tripId)) continue;
      preTripChecklistByTrip.set(execution.tripId, execution);
    }
    const openOccurrencesByTrip = new Map<string, { open: number; critical: number }>();
    for (const row of occurrenceRows) {
      const entry = openOccurrencesByTrip.get(row.tripId) ?? { open: 0, critical: 0 };
      entry.open += row._count;
      if (row.severity === 'CRITICAL') entry.critical += row._count;
      openOccurrencesByTrip.set(row.tripId, entry);
    }

    const staleThresholdMinutes = settings?.alertDelayThresholdMin ?? DEFAULT_STALE_THRESHOLD_MINUTES;
    const now = new Date();

    // Fase 114 -- pior status de manutencao por veiculo (OVERDUE > DUE_SOON >
    // OK > UNKNOWN), avaliado com a MESMA funcao pura reaproveitada acima
    // (evaluateMaintenancePlan) sobre os planos ja carregados em lote. Um
    // veiculo pode ter varios planos ativos (ex: oleo + freios); o pior entre
    // eles e o sinal mostrado na Torre de Controle.
    const odometerByVehicle = new Map<string, number | null>();
    for (const trip of trips) {
      if (trip.composition?.vehicleId) {
        odometerByVehicle.set(trip.composition.vehicleId, toNumberOrNull(trip.composition.vehicle.odometerKm));
      }
    }
    const maintenanceStatusesByVehicle = new Map<string, MaintenancePlanEvaluationStatus[]>();
    for (const plan of activeMaintenancePlans) {
      const lastService = lastCompletedMaintenanceByPlan.get(plan.id) ?? null;
      const currentOdometerKm = odometerByVehicle.get(plan.vehicleId) ?? null;
      const evaluation = evaluateMaintenancePlan(
        { intervalKm: plan.intervalKm, intervalDays: plan.intervalDays, alertBeforeKm: plan.alertBeforeKm, alertBeforeDays: plan.alertBeforeDays },
        lastService,
        currentOdometerKm,
        now,
      );
      const list = maintenanceStatusesByVehicle.get(plan.vehicleId) ?? [];
      list.push(evaluation.status);
      maintenanceStatusesByVehicle.set(plan.vehicleId, list);
    }
    const worstMaintenanceStatus = (statuses: MaintenancePlanEvaluationStatus[]): MaintenancePlanEvaluationStatus => {
      if (statuses.includes('OVERDUE')) return 'OVERDUE';
      if (statuses.includes('DUE_SOON')) return 'DUE_SOON';
      if (statuses.includes('OK')) return 'OK';
      return 'UNKNOWN';
    };

    result.items = trips.map((trip) => {
      const lastPoint = lastPointByTrip.get(trip.id) ?? null;
      const events = deviationsByTrip.get(trip.id) ?? [];
      const hasUnresolvedDeviation = events.some((event) => event.resolvedAt === null);
      const hasRecalculatedRoute = events.some((event) => event.resultingRoutePlanId !== null);
      const speedKmh = toNumberOrNull(lastPoint?.speedKmh ?? null);
      const lastTrackingAt = lastPoint?.recordedAt ?? null;
      const summary = tollSummaries.get(trip.id) ?? null;

      const entity = new TripOperationEntity();
      entity.tripId = trip.id;
      entity.status = trip.status;
      entity.operationalStatus = computeOperationalStatus({
        tripStatus: trip.status,
        lastTrackingAt,
        speedKmh,
        hasUnresolvedDeviation,
        now,
        staleThresholdMinutes,
      });
      entity.driverId = trip.driverId;
      entity.driverName = trip.driver?.name ?? null;
      entity.vehicleId = trip.composition?.vehicleId ?? null;
      entity.vehiclePlate = trip.composition?.vehicle.plate ?? null;
      entity.originName = trip.origin.name;
      entity.destinationName = trip.destination.name;
      // Fase D -- carga REAL (largada) + INTENCAO planejada + vinculo de
      // retorno. Escalares ja carregados pelo TRIP_INCLUDE -- zero query
      // extra. So exibicao; nunca confundir planejado com realizado.
      entity.loadStatus = trip.loadStatus;
      entity.plannedLoadStatus = trip.plannedLoadStatus;
      entity.previousTripId = trip.previousTripId;
      entity.actualDeparture = trip.actualDeparture;
      entity.initialOdometerKm = toNumberOrNull(trip.initialOdometerKm);
      entity.currentOdometerKm = toNumberOrNull(trip.composition?.vehicle.odometerKm ?? null);
      entity.lastPosition = lastPoint ? toPositionEntity(lastPoint) : null;
      entity.minutesSinceLastUpdate = lastTrackingAt
        ? Math.round((now.getTime() - lastTrackingAt.getTime()) / 60_000)
        : null;
      entity.locationFreshness = computeLocationFreshness(lastTrackingAt, now, staleThresholdMinutes);
      entity.movementStatus = computeMovementStatus(speedKmh);
      entity.hasUnresolvedDeviation = hasUnresolvedDeviation;
      entity.hasRecalculatedRoute = hasRecalculatedRoute;
      entity.routePlanId = trip.routePlanId;
      entity.defaultAxles = trip.composition?.axleConfiguration?.totalAxles ?? null;
      entity.tollSummary = toTollSummaryEntity(summary);
      entity.alerts = (alertsByTrip.get(trip.id) ?? []).map(toAlertEntity);

      // Fase 105 -- Torre de Controle.
      const deliveryCounts = deliveryCountsByTrip.get(trip.id) ?? EMPTY_DELIVERY_STOP_STATUS_COUNTS;
      const deliverySummary = new TripOperationDeliverySummaryEntity();
      deliverySummary.pendingCount = deliveryCounts.pending;
      deliverySummary.inProgressCount = deliveryCounts.inProgress;
      deliverySummary.completedCount = deliveryCounts.completed;
      deliverySummary.failedCount = deliveryCounts.failed;
      deliverySummary.cancelledCount = deliveryCounts.cancelled;
      deliverySummary.totalCount =
        deliveryCounts.pending + deliveryCounts.inProgress + deliveryCounts.completed + deliveryCounts.failed + deliveryCounts.cancelled;
      entity.deliverySummary = deliverySummary;

      const occurrenceCounts = openOccurrencesByTrip.get(trip.id) ?? { open: 0, critical: 0 };
      entity.openOccurrencesCount = occurrenceCounts.open;
      entity.criticalOpenOccurrencesCount = occurrenceCounts.critical;

      const preTripChecklist = preTripChecklistByTrip.get(trip.id) ?? null;
      entity.preTripChecklistStatus = preTripChecklist?.status ?? null;
      entity.preTripChecklistHasCriticalNonConformity =
        preTripChecklist?.status === ChecklistExecutionStatus.COMPLETED
          ? hasCriticalNonConformity(preTripChecklist.answers)
          : false;

      entity.plannedArrival = trip.plannedArrival;
      // Mesmo criterio de FleetOperationsMetricsService.delayedTrips: nao
      // terminal (garantido aqui -- getActiveOperations so busca
      // NON_TERMINAL_STATUSES) e plannedArrival no passado.
      entity.isDelayed = trip.plannedArrival !== null && trip.plannedArrival.getTime() < now.getTime();

      // Fase 114 -- Torre de Controle.
      entity.priority = trip.priority;
      const vehicleId = trip.composition?.vehicleId ?? null;
      entity.maintenanceStatus = vehicleId
        ? worstMaintenanceStatus(maintenanceStatusesByVehicle.get(vehicleId) ?? [])
        : 'UNKNOWN';

      return entity;
    });

    return result;
  }

  // Fase D -- valida o vinculo EXPLICITO ida -> retorno (Trip.previousTripId).
  // Regras do pedido: FK inexistente OU de outro tenant -> 404 (mesma
  // mensagem/handler ja usado em todo o modulo); apontar para a propria
  // viagem -> 400. Nunca cria vinculo automatico -- so e chamado quando o
  // operador informa previousTripId no create/update.
  private async assertPreviousTripLinkable(
    tenantId: string,
    selfTripId: string | null,
    previousTripId: string,
  ): Promise<void> {
    if (selfTripId !== null && previousTripId === selfTripId) {
      throw new BadRequestException('previousTripId nao pode ser a propria viagem.');
    }
    const previous = await this.prisma.trip.findFirst({
      where: { id: previousTripId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!previous) {
      throw new NotFoundException('Viagem anterior (previousTripId) nao encontrada.');
    }
  }

  async create(
    tenantId: string,
    dto: CreateTripDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripEntity> {
    if (dto.originLocationId === dto.destinationLocationId) {
      throw new BadRequestException(
        'originLocationId e destinationLocationId nao podem ser o mesmo local.',
      );
    }

    const departure = new Date(dto.plannedDeparture);
    const arrival = new Date(dto.plannedArrival);
    if (arrival <= departure) {
      throw new BadRequestException('plannedArrival deve ser posterior a plannedDeparture.');
    }

    await this.locationsService.findActiveOrThrow(tenantId, dto.originLocationId);
    await this.locationsService.findActiveOrThrow(tenantId, dto.destinationLocationId);
    if (dto.customerId) {
      await this.customersService.findActiveOrThrow(tenantId, dto.customerId);
    }
    if (dto.tollRouteId) {
      await this.tollRoutesService.findActiveOrThrow(tenantId, dto.tollRouteId);
    }
    await this.assertDriverAvailable(tenantId, dto.driverId, departure, arrival);
    const composition = await this.assertCompositionAvailable(tenantId, dto.compositionId);
    await this.assertVehicleAvailable(tenantId, composition.vehicleId, departure, arrival);
    if (dto.previousTripId) {
      await this.assertPreviousTripLinkable(tenantId, null, dto.previousTripId);
    }

    const trip = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trip.create({
        data: {
          tenantId,
          driverId: dto.driverId,
          originLocationId: dto.originLocationId,
          destinationLocationId: dto.destinationLocationId,
          plannedDeparture: departure,
          plannedArrival: arrival,
          ...compact({
            customerId: dto.customerId,
            tollRouteId: dto.tollRouteId,
            priority: dto.priority,
            notes: dto.notes,
            // Fase D -- intencao/vinculo de planejamento. NUNCA tocam
            // status, composicao, actualDeparture/actualArrival nem
            // loadStatus (esse continua exclusivo da largada do motorista).
            previousTripId: dto.previousTripId,
            plannedLoadStatus: dto.plannedLoadStatus,
          }),
        },
      });

      // RouteVersion inicial -- imutavel, unica criada nesta fase.
      await tx.routeVersion.create({
        data: { tenantId, tripId: created.id, versionNumber: 1, reason: 'INITIAL' },
      });

      // TripMetrics 1:1 -- so valores previstos; executados ficam null.
      await tx.tripMetrics.create({
        data: {
          tenantId,
          tripId: created.id,
          ...compact({
            plannedDistanceKm: dto.plannedMetrics?.distanceKm,
            plannedDurationMin: dto.plannedMetrics?.durationMin,
            plannedFuelLiters: dto.plannedMetrics?.fuelLiters,
            plannedTollAmount: dto.plannedMetrics?.tollAmount,
            plannedTotalCost: dto.plannedMetrics?.totalCost,
          }),
        },
      });

      await tx.tripComposition.update({
        where: { id: dto.compositionId },
        data: { tripId: created.id },
      });

      return created;
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip.created',
      entityName: 'Trip',
      entityId: trip.id,
      newValue: toJsonSafe({
        originLocationId: trip.originLocationId,
        destinationLocationId: trip.destinationLocationId,
        plannedDeparture: trip.plannedDeparture,
        plannedArrival: trip.plannedArrival,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    // Eventos de timeline dedicados: motorista e veiculo ja nascem
    // vinculados nesta fase (ambos obrigatorios na criacao).
    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip.driver_linked',
      entityName: 'Trip',
      entityId: trip.id,
      newValue: { driverId: dto.driverId },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip.vehicle_linked',
      entityName: 'Trip',
      entityId: trip.id,
      newValue: { compositionId: dto.compositionId, vehicleId: composition.vehicleId },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.findOne(tenantId, trip.id);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateTripDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    if (before.status !== TripStatus.PLANNED) {
      throw new ConflictException('Somente viagens com status PLANNED podem ser editadas.');
    }

    const originLocationId = dto.originLocationId ?? before.originLocationId;
    const destinationLocationId = dto.destinationLocationId ?? before.destinationLocationId;
    if (originLocationId === destinationLocationId) {
      throw new BadRequestException(
        'originLocationId e destinationLocationId nao podem ser o mesmo local.',
      );
    }

    const departure = dto.plannedDeparture
      ? new Date(dto.plannedDeparture)
      : before.plannedDeparture;
    const arrival = dto.plannedArrival ? new Date(dto.plannedArrival) : before.plannedArrival;
    if (departure && arrival && arrival <= departure) {
      throw new BadRequestException('plannedArrival deve ser posterior a plannedDeparture.');
    }

    if (dto.originLocationId)
      await this.locationsService.findActiveOrThrow(tenantId, dto.originLocationId);
    if (dto.destinationLocationId) {
      await this.locationsService.findActiveOrThrow(tenantId, dto.destinationLocationId);
    }
    if (dto.customerId) await this.customersService.findActiveOrThrow(tenantId, dto.customerId);

    const tollRouteChanged =
      dto.tollRouteId !== undefined && dto.tollRouteId !== before.tollRouteId;
    if (tollRouteChanged && dto.tollRouteId) {
      await this.tollRoutesService.findActiveOrThrow(tenantId, dto.tollRouteId);
    }

    const driverChanged = dto.driverId !== undefined && dto.driverId !== before.driverId;
    if (driverChanged && departure && arrival) {
      await this.assertDriverAvailable(tenantId, dto.driverId as string, departure, arrival, id);
    }

    // Fase D -- so valida quando um previousTripId REAL e informado; `null`
    // (desvincular) e undefined (nao mexer) nao passam pela checagem.
    if (dto.previousTripId !== undefined && dto.previousTripId !== null) {
      await this.assertPreviousTripLinkable(tenantId, id, dto.previousTripId);
    }

    const currentCompositionId = before.composition?.id ?? null;
    const compositionChanged =
      dto.compositionId !== undefined && dto.compositionId !== currentCompositionId;
    let newComposition: { id: string; vehicleId: string } | undefined;
    if (compositionChanged && dto.compositionId) {
      newComposition = await this.assertCompositionAvailable(tenantId, dto.compositionId);
      if (departure && arrival) {
        await this.assertVehicleAvailable(
          tenantId,
          newComposition.vehicleId,
          departure,
          arrival,
          id,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.trip.update({
        where: { id },
        data: compact({
          customerId: dto.customerId,
          driverId: dto.driverId,
          originLocationId: dto.originLocationId,
          destinationLocationId: dto.destinationLocationId,
          tollRouteId: dto.tollRouteId,
          plannedDeparture: dto.plannedDeparture ? departure : undefined,
          plannedArrival: dto.plannedArrival ? arrival : undefined,
          priority: dto.priority,
          notes: dto.notes,
          // Fase D -- compact() preserva `null` (desvincular / limpar
          // intencao) e descarta `undefined` (nao mexer). Nunca afetam
          // status/composicao/actual*/loadStatus.
          previousTripId: dto.previousTripId,
          plannedLoadStatus: dto.plannedLoadStatus,
        }),
      });

      if (compositionChanged) {
        if (currentCompositionId) {
          await tx.tripComposition.update({
            where: { id: currentCompositionId },
            data: { tripId: null },
          });
        }
        if (dto.compositionId) {
          await tx.tripComposition.update({
            where: { id: dto.compositionId },
            data: { tripId: id },
          });
        }
      }
    });

    const after = await this.findOwnedOrThrow(tenantId, id);

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip.updated',
      entityName: 'Trip',
      entityId: id,
      previousValue: toJsonSafe({
        originLocationId: before.originLocationId,
        destinationLocationId: before.destinationLocationId,
        plannedDeparture: before.plannedDeparture,
        plannedArrival: before.plannedArrival,
        driverId: before.driverId,
        compositionId: currentCompositionId,
        tollRouteId: before.tollRouteId,
      }),
      newValue: toJsonSafe({
        originLocationId: after.originLocationId,
        destinationLocationId: after.destinationLocationId,
        plannedDeparture: after.plannedDeparture,
        plannedArrival: after.plannedArrival,
        driverId: after.driverId,
        compositionId: after.composition?.id ?? null,
        tollRouteId: after.tollRouteId,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    if (driverChanged) {
      await this.audit.log({
        tenantId,
        userId: actor.userId,
        action: 'trip.driver_linked',
        entityName: 'Trip',
        entityId: id,
        previousValue: { driverId: before.driverId },
        newValue: { driverId: after.driverId },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
    }
    if (compositionChanged) {
      await this.audit.log({
        tenantId,
        userId: actor.userId,
        action: 'trip.vehicle_linked',
        entityName: 'Trip',
        entityId: id,
        previousValue: { compositionId: currentCompositionId },
        newValue: { compositionId: after.composition?.id ?? null },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
    }

    return toTripEntity(after);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    dto: UpdateTripStatusDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    const allowed = ALLOWED_TRANSITIONS[before.status];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(
        `Transicao de status invalida: ${before.status} -> ${dto.status}.`,
      );
    }

    if (dto.status === TripStatus.IN_PROGRESS) {
      await this.assertCanStart(tenantId, before, id);
    }

    // finalOdometerKm nunca pode regredir a quilometragem do veiculo (mesma
    // regra da Fase 27/28, reaproveitada de common/utils/odometer.util.ts) --
    // vale tanto para o motorista (POST /driver/trips/:id/complete) quanto
    // para o encerramento administrativo (PATCH /trips/:id/status), unico
    // lugar onde COMPLETED de fato grava o odometro.
    let bumpedOdometerKm: number | null = null;
    if (dto.status === TripStatus.COMPLETED && dto.finalOdometerKm !== undefined) {
      const currentOdometerKm = toNumberOrNull(before.composition?.vehicle?.odometerKm ?? null);
      assertOdometerNotBelowVehicle(currentOdometerKm, dto.finalOdometerKm);
      bumpedOdometerKm = computeBumpedOdometer(currentOdometerKm, dto.finalOdometerKm);
    }

    const data: Prisma.TripUpdateInput = { status: dto.status };
    if (dto.status === TripStatus.IN_PROGRESS && !before.actualDeparture) {
      data.actualDeparture = new Date();
    }

    let durationMinutes: number | null = null;
    if (dto.status === TripStatus.COMPLETED) {
      const actualArrival = before.actualArrival ?? new Date();
      data.actualArrival = actualArrival;
      const actualDeparture = before.actualDeparture;
      if (actualDeparture) {
        durationMinutes = Math.round(
          (actualArrival.getTime() - actualDeparture.getTime()) / 60_000,
        );
      }
    }

    // Fase B -- efeitos colaterais sobre VehicleIdlePeriod, gravados na MESMA
    // transacao da transicao de status (atomico com a viagem). Auditados
    // depois do commit (best-effort). Idempotencia/concorrencia garantidas
    // no banco (ver VehicleIdlePeriodsService).
    let idleAutoOpened = false;
    let idleAutoClosedPeriodId: string | null = null;
    const vehicleId = before.composition?.vehicleId ?? null;

    await this.prisma.$transaction(async (tx) => {
      await tx.trip.update({ where: { id }, data });

      // Ao concluir: registra automaticamente duracao (TripMetrics) e
      // quilometragem final (Vehicle.odometerKm, quando informada).
      if (dto.status === TripStatus.COMPLETED) {
        if (durationMinutes !== null) {
          await tx.tripMetrics.update({
            where: { tripId: id },
            data: { actualDurationMin: durationMinutes },
          });
        }
        if (bumpedOdometerKm !== null && before.composition?.vehicleId) {
          await tx.vehicle.update({
            where: { id: before.composition.vehicleId },
            data: { odometerKm: bumpedOdometerKm },
          });
        }
        // Fase B -- ABRE o periodo ocioso do veiculo, ancorado em
        // actualArrival (nunca inventado). Nunca duplica (ON CONFLICT DO
        // NOTHING contra o indice parcial "1 aberto por veiculo").
        if (vehicleId && data.actualArrival instanceof Date) {
          const opened = await this.idlePeriodsService.openForCompletedTrip(tx, {
            tenantId,
            vehicleId,
            startedAt: data.actualArrival,
            tripBeforeId: id,
          });
          idleAutoOpened = opened.created;
        }
      }

      // Fase B -- ao INICIAR de verdade (1a transicao para IN_PROGRESS,
      // quando actualDeparture passa a existir): FECHA o periodo ocioso
      // aberto do veiculo (se houver). Nunca cria um periodo retroativo.
      if (
        dto.status === TripStatus.IN_PROGRESS &&
        !before.actualDeparture &&
        vehicleId &&
        data.actualDeparture instanceof Date
      ) {
        const closed = await this.idlePeriodsService.closeForStartedTrip(tx, {
          tenantId,
          vehicleId,
          endedAt: data.actualDeparture,
          tripAfterId: id,
        });
        idleAutoClosedPeriodId = closed.periodId;
      }
    });

    const action = resolveStatusChangeAction(before.status, dto.status);
    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action,
      entityName: 'Trip',
      entityId: id,
      previousValue: { status: before.status },
      newValue: { status: dto.status },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
    if (dto.status === TripStatus.COMPLETED) {
      // "Chegada" e "Conclusao" sao dois eventos distintos na timeline
      // pedida, ainda que ocorram no mesmo instante nesta fase (sem estado
      // dedicado de "chegou mas nao fechou a viagem").
      await this.audit.log({
        tenantId,
        userId: actor.userId,
        action: 'trip.arrived',
        entityName: 'Trip',
        entityId: id,
        newValue: { actualArrival: data.actualArrival },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
      await this.updateActualTripMetrics(tenantId, id, before, dto, actor, metadata);
    }

    // Fase B -- auditoria dos efeitos sobre VehicleIdlePeriod (pos-commit,
    // best-effort: nunca desfaz a transicao ja confirmada).
    if (idleAutoOpened && vehicleId) {
      await this.idlePeriodsService.logAutoOpen(tenantId, vehicleId, id, actor, metadata);
    }
    if (idleAutoClosedPeriodId) {
      await this.idlePeriodsService.logAutoClose(tenantId, idleAutoClosedPeriodId, id, actor, metadata);
    }

    return this.findOne(tenantId, id);
  }

  // Fase 66 -- "resultado operacional": ate esta fase, TripMetrics.actual*
  // (secao "executado" do modelo, ja existente desde a criacao da Trip)
  // nunca era escrito, exceto actualDurationMin. Reaproveita integralmente
  // TripSettlementsService.getFinancialDashboard (MESMOS agregados/MESMA
  // regra de despesa APPROVED ja usados por GET /trips/:id/financial-dashboard
  // e pelo fechamento -- nunca um segundo motor financeiro com numero
  // divergente) para fuelCost/tollCost/totalCost; litros e a UNICA agregacao
  // nova aqui (quantidade fisica, nao financeira). actualDistanceKm so e
  // calculado quando o motorista/administrador informou finalOdometerKm
  // nesta chamada E existe Trip.initialOdometerKm -- nunca uma distancia
  // estimada (secao 6/11 do pedido).
  private async updateActualTripMetrics(
    tenantId: string,
    tripId: string,
    before: TripWithRelations,
    dto: UpdateTripStatusDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const initialOdometerKm = toNumberOrNull(before.initialOdometerKm);
    const actualDistanceKm =
      dto.finalOdometerKm !== undefined &&
      initialOdometerKm !== null &&
      dto.finalOdometerKm >= initialOdometerKm
        ? dto.finalOdometerKm - initialOdometerKm
        : null;

    const beforeMetrics = await this.prisma.tripMetrics.findUnique({ where: { tripId } });
    if (!beforeMetrics) return;

    const [fuelAgg, financialDashboard] = await Promise.all([
      this.prisma.fuelSupply.aggregate({ where: { tenantId, tripId }, _sum: { liters: true } }),
      this.tripSettlementsService.getFinancialDashboard(tenantId, tripId),
    ]);

    const metrics = await this.prisma.tripMetrics.update({
      where: { tripId },
      data: {
        actualDistanceKm,
        actualFuelLiters: toNumberOrNull(fuelAgg._sum.liters),
        actualTollAmount: financialDashboard.tollCost,
        actualTotalCost: financialDashboard.totalCost,
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_metrics.updated',
      entityName: 'TripMetrics',
      entityId: metrics.id,
      previousValue: toJsonSafe(beforeMetrics),
      newValue: toJsonSafe(metrics),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  cancel(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripEntity> {
    return this.updateStatus(tenantId, id, { status: TripStatus.CANCELLED }, actor, metadata);
  }

  async softDelete(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    // So permitido enquanto a viagem nunca saiu do planejamento (ou ja foi
    // cancelada) -- qualquer outro estado intermediario (Fase 14) significa
    // que a viagem ja envolveu motorista/veiculo em campo.
    if (before.status !== TripStatus.PLANNED && before.status !== TripStatus.CANCELLED) {
      throw new ConflictException(
        'Nao e possivel excluir uma viagem que ja saiu do planejamento (apenas PLANNED ou CANCELLED).',
      );
    }

    await this.prisma.trip.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip.deleted',
      entityName: 'Trip',
      entityId: id,
      previousValue: { status: before.status },
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  async findOwnedOrThrow(tenantId: string, id: string): Promise<TripWithRelations> {
    const trip = await this.prisma.trip.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: TRIP_INCLUDE,
    });
    if (!trip) {
      throw new NotFoundException('Viagem nao encontrada.');
    }
    return trip;
  }

  // "Nao permitir iniciar viagem": motorista inativo, veiculo inativo/em
  // manutencao, motorista ou veiculo ja em outra viagem fisicamente ativa
  // (IN_PROGRESS/PAUSED -- ninguem dirige dois caminhoes ao mesmo tempo).
  private async assertCanStart(
    tenantId: string,
    trip: TripWithRelations,
    tripId: string,
  ): Promise<void> {
    if (trip.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: trip.driverId, tenantId, deletedAt: null },
      });
      if (!driver || !driver.isActive) {
        throw new ConflictException('Nao e possivel iniciar a viagem: motorista inativo.');
      }

      const driverBusy = await this.prisma.trip.findFirst({
        where: {
          tenantId,
          driverId: trip.driverId,
          deletedAt: null,
          id: { not: tripId },
          status: { in: [TripStatus.IN_PROGRESS, TripStatus.PAUSED] },
        },
      });
      if (driverBusy) {
        throw new ConflictException(
          'Nao e possivel iniciar a viagem: motorista ja esta em outra viagem ativa.',
        );
      }
    }

    const vehicleId = trip.composition?.vehicleId;
    if (vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: vehicleId, tenantId, deletedAt: null },
      });
      if (!vehicle) {
        throw new ConflictException('Nao e possivel iniciar a viagem: veiculo nao encontrado.');
      }
      if (vehicle.status === VehicleStatus.MAINTENANCE) {
        throw new ConflictException('Nao e possivel iniciar a viagem: veiculo em manutencao.');
      }
      if (vehicle.status !== VehicleStatus.ACTIVE) {
        throw new ConflictException('Nao e possivel iniciar a viagem: veiculo inativo.');
      }

      const vehicleBusy = await this.prisma.trip.findFirst({
        where: {
          tenantId,
          deletedAt: null,
          id: { not: tripId },
          status: { in: [TripStatus.IN_PROGRESS, TripStatus.PAUSED] },
          composition: { vehicleId },
        },
      });
      if (vehicleBusy) {
        throw new ConflictException(
          'Nao e possivel iniciar a viagem: veiculo ja esta em outra viagem ativa.',
        );
      }
    }

    await this.assertPreTripChecklistSatisfied(tenantId, trip, tripId);
  }

  // Fase 111 -- opt-in por tenant (TenantSettings.preferences.requirePreTripChecklist,
  // default false -- nenhuma viagem/tenant existente e afetada a menos que
  // ative explicitamente, ver trip-preferences.util.ts). Quando ligado, a
  // viagem so inicia se houver um ChecklistExecution PRE_TRIP para ESTA
  // viagem que esteja COMPLETED e sem nao-conformidade critica sem
  // resolucao -- mesma funcao pura ja usada por ChecklistExecutionsService/
  // NotificationsService (hasCriticalNonConformity), nunca uma segunda
  // regra. So verifica quando ha veiculo vinculado (sem composicao, nao ha
  // o que inspecionar).
  private async assertPreTripChecklistSatisfied(
    tenantId: string,
    trip: TripWithRelations,
    tripId: string,
  ): Promise<void> {
    if (!trip.composition?.vehicleId) return;

    const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    if (!resolveRequirePreTripChecklist(settings?.preferences)) return;

    const execution = await this.prisma.checklistExecution.findFirst({
      where: { tenantId, tripId, template: { type: ChecklistType.PRE_TRIP } },
      orderBy: { startedAt: 'desc' },
      include: { answers: { include: { item: true } } },
    });

    if (!execution || execution.status !== ChecklistExecutionStatus.COMPLETED) {
      throw new ConflictException(
        'Nao e possivel iniciar a viagem: checklist pre-viagem obrigatorio nao foi concluido.',
      );
    }
    if (hasCriticalNonConformity(execution.answers)) {
      throw new ConflictException(
        'Nao e possivel iniciar a viagem: checklist pre-viagem tem nao-conformidade critica pendente.',
      );
    }
  }

  private async assertDriverAvailable(
    tenantId: string,
    driverId: string,
    departure: Date,
    arrival: Date,
    excludeTripId?: string,
  ): Promise<void> {
    const driver = await this.prisma.driver.findFirst({
      where: { id: driverId, tenantId, deletedAt: null, isActive: true },
    });
    if (!driver) {
      throw new NotFoundException('Motorista (driverId) nao encontrado ou inativo nesta empresa.');
    }

    const overlapping = await this.prisma.trip.findFirst({
      where: {
        tenantId,
        driverId,
        deletedAt: null,
        status: { in: NON_TERMINAL_STATUSES },
        ...(excludeTripId ? { id: { not: excludeTripId } } : {}),
        plannedDeparture: { lt: arrival },
        plannedArrival: { gt: departure },
      },
    });
    if (overlapping) {
      throw new ConflictException(
        'Motorista ja possui outra viagem planejada/em andamento no mesmo periodo.',
      );
    }
  }

  // Mesma logica de disponibilidade por data do motorista, aplicada ao
  // veiculo por tras da composicao -- nao basta a composicao estar livre
  // (unica por vez), o mesmo VEICULO pode estar preso a uma composicao
  // diferente ja vinculada a outra viagem no mesmo periodo.
  private async assertVehicleAvailable(
    tenantId: string,
    vehicleId: string,
    departure: Date,
    arrival: Date,
    excludeTripId?: string,
  ): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, tenantId, deletedAt: null },
    });
    if (!vehicle) {
      throw new NotFoundException('Veiculo (via compositionId) nao encontrado nesta empresa.');
    }
    // Fase 87 -- reaproveita a MESMA regra central de disponibilidade da
    // Fase 81/86 (resolveVehicleAvailability, nunca uma segunda checagem de
    // status). onTrip e forcado a false de proposito: "em viagem AGORA" nao
    // impede planejar uma viagem FUTURA (isso e responsabilidade exclusiva
    // da checagem de conflito de agenda abaixo) -- so o STATUS do veiculo
    // (inativo/suspenso/em manutencao/vendido) bloqueia o planejamento em si.
    if (resolveVehicleAvailability(vehicle.status, false) === 'UNAVAILABLE') {
      throw new ConflictException(
        'Veiculo indisponivel para planejamento (status diferente de ativo).',
      );
    }

    const overlapping = await this.prisma.trip.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: NON_TERMINAL_STATUSES },
        ...(excludeTripId ? { id: { not: excludeTripId } } : {}),
        plannedDeparture: { lt: arrival },
        plannedArrival: { gt: departure },
        composition: { vehicleId },
      },
    });
    if (overlapping) {
      throw new ConflictException(
        'Veiculo ja possui outra viagem planejada/em andamento no mesmo periodo.',
      );
    }
  }

  private async assertCompositionAvailable(
    tenantId: string,
    compositionId: string,
  ): Promise<{ id: string; vehicleId: string }> {
    const composition = await this.prisma.tripComposition.findFirst({
      where: { id: compositionId, tenantId },
    });
    if (!composition) {
      throw new NotFoundException('Composicao (compositionId) nao encontrada nesta empresa.');
    }
    if (composition.tripId) {
      throw new ConflictException('Esta composicao ja esta vinculada a outra viagem.');
    }
    return composition;
  }
}

function toPositionEntity(point: TrackingPoint): TripOperationPositionEntity {
  const entity = new TripOperationPositionEntity();
  entity.latitude = point.latitude.toNumber();
  entity.longitude = point.longitude.toNumber();
  entity.recordedAt = point.recordedAt;
  entity.speedKmh = toNumberOrNull(point.speedKmh);
  entity.headingDeg = toNumberOrNull(point.headingDeg);
  return entity;
}

function toTollSummaryEntity(result: TollReconciliationResult | null): TripOperationTollSummaryEntity {
  const entity = new TripOperationTollSummaryEntity();
  entity.plannedCount = result?.expectedStopsCount ?? 0;
  entity.registeredCount = result?.registeredStopsCount ?? 0;
  entity.pendingCount = result?.notRegisteredCount ?? 0;
  entity.unplannedCount = result?.unplannedCount ?? 0;
  entity.reconciliationStatus = result?.status ?? 'PENDING';
  return entity;
}

function toAlertEntity(alert: Alert): TripOperationAlertEntity {
  const entity = new TripOperationAlertEntity();
  entity.id = alert.id;
  entity.type = alert.type;
  entity.severity = alert.severity;
  entity.message = alert.message;
  entity.createdAt = alert.createdAt;
  return entity;
}
