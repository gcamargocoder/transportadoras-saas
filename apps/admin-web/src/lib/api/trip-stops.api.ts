import type { Paginated, PaginationParams } from '../../types/api';
import type { TripStopListItemEntity } from '../../types/entities';
import type { TripStopStatus, TripStopType } from '../../types/enums';
import { api } from './http';

// Fase 43 -- gestao administrativa (cross-frota) de paradas operacionais.
// Espelha FindTripStopsQueryDto (apps/api/src/trip-operations/dto):
// from/to filtram por startedAt (data do evento real, nunca createdAt).
export interface FindTripStopsQuery extends PaginationParams {
  from?: string | undefined;
  to?: string | undefined;
  vehicleId?: string | undefined;
  driverId?: string | undefined;
  tripId?: string | undefined;
  type?: TripStopType | undefined;
  status?: TripStopStatus | undefined;
}

export function listTripStops(query: FindTripStopsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<TripStopListItemEntity>>('/trip-stops', query, signal);
}
