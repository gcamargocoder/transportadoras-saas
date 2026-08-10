import { apiRequest } from './http';
import {
  AxleEvent,
  AxleEventSource,
  DriverActiveTrip,
  DriverConfig,
  DriverRoute,
  DriverTrip,
  FuelSupply,
  NearbyTollPlaza,
  RouteComparison,
  TrackingPointInput,
  TrackingPointsSyncResult,
  TripLoadStatus,
  TripStop,
  TripStopType,
} from './driverTrips.types';

export function getConfig(): Promise<DriverConfig> {
  return apiRequest<DriverConfig>('/driver/config');
}

export function getActiveTrip(): Promise<DriverActiveTrip | null> {
  return apiRequest<DriverActiveTrip | null>('/driver/trips/active');
}

export function getTrip(tripId: string): Promise<DriverTrip> {
  return apiRequest<DriverTrip>(`/driver/trips/${tripId}`);
}

// Fase 27 -- tela "INICIAR VIAGEM": KM/carga sao opcionais no contrato HTTP
// (compatibilidade com chamadas antigas sem corpo), mas a tela sempre envia
// os dois quando o motorista preenche o formulario de largada.
export function startTrip(
  tripId: string,
  input?: { odometerKm?: number; loadStatus?: TripLoadStatus },
): Promise<DriverTrip> {
  return apiRequest<DriverTrip>(`/driver/trips/${tripId}/start`, {
    method: 'POST',
    body: input ?? {},
  });
}

// Fase 28 -- posicao GPS opcional (o motorista pode estar sem sinal no
// momento da pausa/retomada); quando informada, o backend registra como um
// TrackingPoint normal (reavalia desvio de rota na retomada automaticamente).
export function pauseTrip(
  tripId: string,
  position?: { latitude: number; longitude: number },
): Promise<DriverTrip> {
  return apiRequest<DriverTrip>(`/driver/trips/${tripId}/pause`, {
    method: 'POST',
    body: position ?? {},
  });
}

export function resumeTrip(
  tripId: string,
  position?: { latitude: number; longitude: number },
): Promise<DriverTrip> {
  return apiRequest<DriverTrip>(`/driver/trips/${tripId}/resume`, {
    method: 'POST',
    body: position ?? {},
  });
}

// Fase 28 -- tela "FINALIZAR VIAGEM": KM final opcional no contrato HTTP
// (mesmo principio da Fase 27), mas a tela sempre envia quando o motorista
// preenche o formulario de encerramento.
export function completeTrip(
  tripId: string,
  input?: { finalOdometerKm?: number; latitude?: number; longitude?: number },
): Promise<DriverTrip> {
  return apiRequest<DriverTrip>(`/driver/trips/${tripId}/complete`, {
    method: 'POST',
    body: input ?? {},
  });
}

export function sendLocations(
  tripId: string,
  points: TrackingPointInput[],
): Promise<TrackingPointsSyncResult> {
  return apiRequest<TrackingPointsSyncResult>(`/driver/trips/${tripId}/locations`, {
    method: 'POST',
    body: { points },
  });
}

export function getNearbyTollPlazas(
  tripId: string,
  lat: number,
  lng: number,
): Promise<NearbyTollPlaza[]> {
  return apiRequest<NearbyTollPlaza[]>(`/driver/trips/${tripId}/nearby-toll-plazas`, {
    query: { lat, lng },
  });
}

export function openStop(
  tripId: string,
  input: { deviceEventId: string; latitude: number; longitude: number; startedAt: string },
): Promise<TripStop> {
  return apiRequest<TripStop>(`/driver/trips/${tripId}/stops`, { method: 'POST', body: input });
}

export function closeStop(
  tripId: string,
  stopId: string,
  input: { endedAt: string; type?: TripStopType; locationLabel?: string },
): Promise<TripStop> {
  return apiRequest<TripStop>(`/driver/trips/${tripId}/stops/${stopId}/close`, {
    method: 'PATCH',
    body: input,
  });
}

export function getStops(tripId: string): Promise<TripStop[]> {
  return apiRequest<TripStop[]>(`/driver/trips/${tripId}/stops`);
}

export function createFuelSupply(
  tripId: string,
  input: {
    deviceEventId: string;
    odometerKm: number;
    liters: number;
    pricePerLiter?: number;
    latitude?: number;
    longitude?: number;
  },
): Promise<FuelSupply> {
  return apiRequest<FuelSupply>(`/driver/trips/${tripId}/fuel-supplies`, {
    method: 'POST',
    body: input,
  });
}

export function openAxleEvent(
  tripId: string,
  input: {
    deviceEventId: string;
    tollPlazaId?: string;
    declaredAxles?: number;
    source: AxleEventSource;
    latitude: number;
    longitude: number;
  },
): Promise<AxleEvent> {
  return apiRequest<AxleEvent>(`/driver/trips/${tripId}/axle-events`, {
    method: 'POST',
    body: input,
  });
}

export function closeAxleEvent(
  tripId: string,
  eventId: string,
  endedAt: string,
): Promise<AxleEvent> {
  return apiRequest<AxleEvent>(`/driver/trips/${tripId}/axle-events/${eventId}/close`, {
    method: 'PATCH',
    body: { endedAt },
  });
}

// Fase 26 -- roteirizacao geografica.
export function getRoute(tripId: string): Promise<DriverRoute | null> {
  return apiRequest<DriverRoute | null>(`/driver/trips/${tripId}/route`);
}

export function recalculateRoute(tripId: string): Promise<{
  previous: unknown;
  next: unknown;
  difference: RouteComparison | null;
}> {
  return apiRequest(`/driver/trips/${tripId}/route/recalculate`, { method: 'POST' });
}
