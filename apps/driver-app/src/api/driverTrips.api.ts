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

export function startTrip(tripId: string): Promise<DriverTrip> {
  return apiRequest<DriverTrip>(`/driver/trips/${tripId}/start`, { method: 'POST' });
}

export function pauseTrip(tripId: string): Promise<DriverTrip> {
  return apiRequest<DriverTrip>(`/driver/trips/${tripId}/pause`, { method: 'POST' });
}

export function resumeTrip(tripId: string): Promise<DriverTrip> {
  return apiRequest<DriverTrip>(`/driver/trips/${tripId}/resume`, { method: 'POST' });
}

export function completeTrip(tripId: string): Promise<DriverTrip> {
  return apiRequest<DriverTrip>(`/driver/trips/${tripId}/complete`, { method: 'POST' });
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
