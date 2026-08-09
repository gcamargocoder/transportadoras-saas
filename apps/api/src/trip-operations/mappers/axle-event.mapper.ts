import { AxleEvent, TollPlaza } from '@prisma/client';
import { AxleEventEntity } from '../entities/axle-event.entity';

export type AxleEventWithRelations = AxleEvent & { tollPlaza: TollPlaza | null };

export function toAxleEventEntity(event: AxleEventWithRelations): AxleEventEntity {
  const entity = new AxleEventEntity();
  entity.id = event.id;
  entity.tripId = event.tripId;
  entity.tollPlazaId = event.tollPlazaId;
  entity.tollPlazaName = event.tollPlaza?.name ?? null;
  entity.defaultAxles = event.defaultAxles;
  entity.declaredAxles = event.declaredAxles;
  entity.suspendedAxles = event.suspendedAxles;
  entity.source = event.source;
  entity.startedAt = event.startedAt;
  entity.endedAt = event.endedAt;
  entity.syncStatus = event.syncStatus;
  entity.createdAt = event.createdAt;
  return entity;
}
