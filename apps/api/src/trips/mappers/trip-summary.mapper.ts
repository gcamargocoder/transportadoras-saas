import { ChecklistExecutionStatus, Prisma, TripMetrics } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TripSummaryEntity } from '../entities/trip-summary.entity';
import { TripOperationDeliverySummaryEntity } from '../entities/trip-operation.entity';
import { DeliveryStopStatusCounts } from '../utils/empty-trip.util';
import { TripWithRelations } from './trip.mapper';

// Fase 112 -- prontidao de planejamento, todos os dados ja resolvidos pelo
// service (nunca calculados aqui -- este mapper so monta a entidade,
// consistente com o restante do arquivo).
export interface TripReadinessData {
  readyToStart: boolean;
  notReadyReason: string | null;
  routePlanComputed: boolean;
  plannedMetricsSynced: boolean;
  preTripChecklistRequired: boolean;
  preTripChecklistStatus: ChecklistExecutionStatus | null;
  preTripChecklistHasCriticalNonConformity: boolean;
  plannedWeightKg: number | null;
  vehicleCapacityKg: number | null;
  // Fase 116 -- consolidacao do fechamento, mesmos dados ja resolvidos pelo
  // service (mesmo padrao acima).
  deliveryStopCounts: DeliveryStopStatusCounts;
  openOccurrencesCount: number;
  criticalOpenOccurrencesCount: number;
}

export function toTripSummaryEntity(
  trip: TripWithRelations,
  metrics: TripMetrics | null,
  tollAggregate: { count: number; total: Prisma.Decimal | null },
  readiness: TripReadinessData,
): TripSummaryEntity {
  const entity = new TripSummaryEntity();
  entity.tripId = trip.id;
  entity.status = trip.status;
  entity.driverId = trip.driverId;
  entity.driverName = trip.driver?.name ?? null;
  entity.vehicleId = trip.composition?.vehicleId ?? null;
  entity.vehiclePlate = trip.composition?.vehicle.plate ?? null;
  entity.originName = trip.origin.name;
  entity.destinationName = trip.destination.name;
  entity.plannedDeparture = trip.plannedDeparture;
  entity.plannedArrival = trip.plannedArrival;
  entity.actualDeparture = trip.actualDeparture;
  entity.actualArrival = trip.actualArrival;
  entity.durationMinutes = metrics?.actualDurationMin ?? metrics?.plannedDurationMin ?? null;
  entity.distanceKm =
    toNumberOrNull(metrics?.actualDistanceKm) ?? toNumberOrNull(metrics?.plannedDistanceKm);
  entity.tollTransactionsCount = tollAggregate.count;
  entity.tollTransactionsTotal = toNumberOrNull(tollAggregate.total) ?? 0;
  entity.plannedTotalCost = toNumberOrNull(metrics?.plannedTotalCost);
  entity.actualTotalCost = toNumberOrNull(metrics?.actualTotalCost);

  entity.readyToStart = readiness.readyToStart;
  entity.notReadyReason = readiness.notReadyReason;
  entity.hasComposition = trip.composition !== null;
  entity.routePlanComputed = readiness.routePlanComputed;
  entity.plannedMetricsSynced = readiness.plannedMetricsSynced;
  entity.preTripChecklistRequired = readiness.preTripChecklistRequired;
  entity.preTripChecklistStatus = readiness.preTripChecklistStatus;
  entity.preTripChecklistHasCriticalNonConformity = readiness.preTripChecklistHasCriticalNonConformity;
  entity.plannedWeightKg = readiness.plannedWeightKg;
  entity.vehicleCapacityKg = readiness.vehicleCapacityKg;
  entity.withinCapacity =
    readiness.plannedWeightKg !== null && readiness.vehicleCapacityKg !== null
      ? readiness.plannedWeightKg <= readiness.vehicleCapacityKg
      : null;

  // Fase 116 -- consolidacao do fechamento (mesma formula/entidade ja
  // usada em TripOperationEntity.deliverySummary, Fase 105 -- nunca uma
  // segunda formula).
  const deliveryCounts = readiness.deliveryStopCounts;
  const deliverySummary = new TripOperationDeliverySummaryEntity();
  deliverySummary.pendingCount = deliveryCounts.pending;
  deliverySummary.inProgressCount = deliveryCounts.inProgress;
  deliverySummary.completedCount = deliveryCounts.completed;
  deliverySummary.failedCount = deliveryCounts.failed;
  deliverySummary.cancelledCount = deliveryCounts.cancelled;
  deliverySummary.totalCount =
    deliveryCounts.pending + deliveryCounts.inProgress + deliveryCounts.completed + deliveryCounts.failed + deliveryCounts.cancelled;
  entity.deliverySummary = deliverySummary;
  entity.openOccurrencesCount = readiness.openOccurrencesCount;
  entity.criticalOpenOccurrencesCount = readiness.criticalOpenOccurrencesCount;

  return entity;
}
