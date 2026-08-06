import { RouteVersion } from '@prisma/client';
import { RouteVersionEntity } from '../entities/route-version.entity';

export function toRouteVersionEntity(version: RouteVersion): RouteVersionEntity {
  const entity = new RouteVersionEntity();
  entity.id = version.id;
  entity.tripId = version.tripId;
  entity.versionNumber = version.versionNumber;
  entity.reason = version.reason;
  entity.createdAt = version.createdAt;
  return entity;
}
