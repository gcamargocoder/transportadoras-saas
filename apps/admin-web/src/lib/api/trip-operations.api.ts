// Fase 25 -- visibilidade administrativa (somente leitura) sobre o que o
// app do motorista registrou: localizacao, paradas e excecoes de eixo.
// Escrita fica exclusivamente no app do motorista (API /driver/*).
import type { AxleEventEntity, TrackingPointEntity, TripStopEntity } from '../../types/entities';
import { api } from './http';

export function listTripLocations(tripId: string, signal?: AbortSignal) {
  return api.get<TrackingPointEntity[]>(`/trips/${tripId}/locations`, undefined, signal);
}

export function listTripStops(tripId: string, signal?: AbortSignal) {
  return api.get<TripStopEntity[]>(`/trips/${tripId}/stops`, undefined, signal);
}

export function listAxleEvents(tripId: string, signal?: AbortSignal) {
  return api.get<AxleEventEntity[]>(`/trips/${tripId}/axle-events`, undefined, signal);
}
