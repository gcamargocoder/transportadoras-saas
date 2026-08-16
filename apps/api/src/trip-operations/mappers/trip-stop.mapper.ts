import { TripStop } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TripStopEntity, TripStopListItemEntity, TripStopStatus } from '../entities/trip-stop.entity';

// Fase 43 -- status e SEMPRE derivado, nunca uma coluna propria (evita
// desincronizacao entre coluna e realidade). CANCELLED tem prioridade sobre
// COMPLETED: um evento pode ter sido fechado e depois cancelado pelo admin
// (correcao de um registro indevido), o cancelamento e a palavra final.
export function computeTripStopStatus(stop: { endedAt: Date | null; cancelledAt: Date | null }): TripStopStatus {
  if (stop.cancelledAt) return 'CANCELLED';
  if (stop.endedAt) return 'COMPLETED';
  return 'OPEN';
}

export function toTripStopEntity(stop: TripStop): TripStopEntity {
  const entity = new TripStopEntity();
  entity.id = stop.id;
  entity.tripId = stop.tripId;
  entity.vehicleId = stop.vehicleId;
  entity.driverId = stop.driverId;
  entity.type = stop.type;
  entity.status = computeTripStopStatus(stop);
  entity.source = stop.source;
  // Nunca 0/0 como coordenada "vazia" -- 0,0 e um ponto real (costa da
  // Africa); ausencia de dado fica null, nunca inventada.
  entity.latitude = toNumberOrNull(stop.latitude);
  entity.longitude = toNumberOrNull(stop.longitude);
  entity.startedAt = stop.startedAt;
  entity.endedAt = stop.endedAt;
  entity.durationMinutes = stop.durationMinutes;
  entity.locationLabel = stop.locationLabel;
  entity.notes = stop.notes;
  entity.cancelledAt = stop.cancelledAt;
  entity.syncStatus = stop.syncStatus;
  entity.deviceEventId = stop.deviceEventId;
  entity.createdAt = stop.createdAt;
  entity.updatedAt = stop.updatedAt;
  return entity;
}

// Fase 43 -- base para TripStopListItemEntity; vehiclePlate/driverName/
// tripReference sao preenchidos pelo CHAMADOR (TripStopsService.findAllPaginated),
// que ja resolveu tudo em lote -- este mapper nunca consulta o banco.
export function toTripStopListItemEntity(stop: TripStop): TripStopListItemEntity {
  const base = toTripStopEntity(stop);
  const entity = new TripStopListItemEntity();
  Object.assign(entity, base);
  entity.vehiclePlate = '—';
  entity.driverName = null;
  entity.tripReference = null;
  return entity;
}
