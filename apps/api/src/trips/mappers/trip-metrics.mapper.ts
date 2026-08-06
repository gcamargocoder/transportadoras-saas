import { Prisma, TripMetrics } from '@prisma/client';
import { TripMetricsEntity } from '../entities/trip-metrics.entity';

function toNumberOrNull(value: Prisma.Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}

export function toTripMetricsEntity(metrics: TripMetrics): TripMetricsEntity {
  const entity = new TripMetricsEntity();
  entity.id = metrics.id;
  entity.tripId = metrics.tripId;
  entity.plannedDistanceKm = toNumberOrNull(metrics.plannedDistanceKm);
  entity.plannedDurationMin = metrics.plannedDurationMin;
  entity.plannedFuelLiters = toNumberOrNull(metrics.plannedFuelLiters);
  entity.plannedTollAmount = toNumberOrNull(metrics.plannedTollAmount);
  entity.plannedTotalCost = toNumberOrNull(metrics.plannedTotalCost);
  entity.actualDistanceKm = toNumberOrNull(metrics.actualDistanceKm);
  entity.actualDurationMin = metrics.actualDurationMin;
  entity.actualFuelLiters = toNumberOrNull(metrics.actualFuelLiters);
  entity.actualTollAmount = toNumberOrNull(metrics.actualTollAmount);
  entity.actualTotalCost = toNumberOrNull(metrics.actualTotalCost);
  entity.updatedAt = metrics.updatedAt;
  return entity;
}
