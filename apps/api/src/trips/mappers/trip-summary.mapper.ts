import { Prisma, TripMetrics } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TripSummaryEntity } from '../entities/trip-summary.entity';
import { TripWithRelations } from './trip.mapper';

export function toTripSummaryEntity(
  trip: TripWithRelations,
  metrics: TripMetrics | null,
  tollAggregate: { count: number; total: Prisma.Decimal | null },
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
  return entity;
}
