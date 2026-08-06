import { RouteEvent } from '@prisma/client';
import { RouteEventEntity } from '../entities/route-event.entity';

export function toRouteEventEntity(event: RouteEvent): RouteEventEntity {
  const entity = new RouteEventEntity();
  entity.id = event.id;
  entity.tripId = event.tripId;
  entity.type = event.type;
  entity.detectedAt = event.detectedAt;
  entity.resolvedAt = event.resolvedAt;
  entity.resultingRouteVersionId = event.resultingRouteVersionId;
  return entity;
}
