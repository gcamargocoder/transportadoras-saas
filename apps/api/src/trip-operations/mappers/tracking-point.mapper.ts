import { TrackingPoint } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TrackingPointEntity } from '../entities/tracking-point.entity';

export function toTrackingPointEntity(point: TrackingPoint): TrackingPointEntity {
  const entity = new TrackingPointEntity();
  entity.id = point.id;
  entity.tripId = point.tripId;
  entity.latitude = toNumberOrNull(point.latitude) ?? 0;
  entity.longitude = toNumberOrNull(point.longitude) ?? 0;
  entity.speedKmh = toNumberOrNull(point.speedKmh);
  entity.headingDeg = toNumberOrNull(point.headingDeg);
  entity.recordedAt = point.recordedAt;
  return entity;
}
