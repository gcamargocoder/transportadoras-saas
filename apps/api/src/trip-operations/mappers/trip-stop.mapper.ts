import { TripStop } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TripStopEntity } from '../entities/trip-stop.entity';

export function toTripStopEntity(stop: TripStop): TripStopEntity {
  const entity = new TripStopEntity();
  entity.id = stop.id;
  entity.tripId = stop.tripId;
  entity.vehicleId = stop.vehicleId;
  entity.driverId = stop.driverId;
  entity.type = stop.type;
  entity.latitude = toNumberOrNull(stop.latitude) ?? 0;
  entity.longitude = toNumberOrNull(stop.longitude) ?? 0;
  entity.startedAt = stop.startedAt;
  entity.endedAt = stop.endedAt;
  entity.durationMinutes = stop.durationMinutes;
  entity.locationLabel = stop.locationLabel;
  entity.syncStatus = stop.syncStatus;
  entity.createdAt = stop.createdAt;
  return entity;
}
