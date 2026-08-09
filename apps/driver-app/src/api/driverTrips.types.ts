// Espelha os enums/entities relevantes do backend (Fase 25) -- so os campos
// que o app do motorista realmente consome.
export type TripStatus =
  | 'PLANNED'
  | 'WAITING_DRIVER'
  | 'WAITING_DEPARTURE'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELLED';

export type TripStopType = 'UNKNOWN' | 'FUEL' | 'REST' | 'MEAL' | 'MAINTENANCE' | 'OTHER';
export type AxleEventSource = 'DRIVER_INPUT' | 'TIMEOUT_DEFAULT';
export type SyncStatus = 'PENDING' | 'SYNCED' | 'FAILED';
export type TripLoadStatus = 'LOADED' | 'EMPTY';

export interface LastLocation {
  latitude: number;
  longitude: number;
  recordedAt: string;
}

export interface DriverActiveTrip {
  id: string;
  status: TripStatus;
  destinationName: string;
  vehiclePlate: string | null;
  lastLocation: LastLocation | null;
  updatedAt: string;
}

export interface DriverTrip {
  id: string;
  destinationName: string;
  originName: string;
  vehiclePlate: string | null;
  status: TripStatus;
  plannedDeparture: string | null;
  plannedArrival: string | null;
  loadStatus: TripLoadStatus | null;
  initialOdometerKm: number | null;
  currentOdometerKm: number | null;
  defaultAxles: number | null;
}

export interface DriverConfig {
  gpsPingIntervalSeconds: number;
  stopDetectionMinutes: number;
  stopRadiusMeters: number;
  tollProximityRadiusMeters: number;
}

export interface NearbyTollPlaza {
  tollPlazaId: string;
  name: string;
  highway: string | null;
  distanceMeters: number;
  defaultAxles: number;
}

export interface TripStop {
  id: string;
  tripId: string;
  type: TripStopType;
  latitude: number;
  longitude: number;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  locationLabel: string | null;
  syncStatus: SyncStatus;
}

export interface AxleEvent {
  id: string;
  tripId: string;
  tollPlazaId: string | null;
  tollPlazaName: string | null;
  defaultAxles: number;
  declaredAxles: number;
  suspendedAxles: number;
  source: AxleEventSource;
  startedAt: string;
  endedAt: string | null;
}

export interface FuelSupply {
  id: string;
  tripId: string | null;
  liters: number;
  odometerKm: number;
}

export interface TrackingPointInput {
  deviceEventId: string;
  latitude: number;
  longitude: number;
  speedKmh?: number;
  headingDeg?: number;
  recordedAt: string;
}

export interface TrackingPointsSyncResult {
  received: number;
  created: number;
  duplicates: number;
}

// Fase 26 -- roteirizacao geografica. Visao MINIMA para o app do motorista
// (nunca a RoutePlan administrativa inteira -- ver backend DriverRouteEntity).
export interface NextToll {
  name: string;
  distanceMeters: number;
  defaultAxles: number;
}

export interface DriverRoute {
  destinationLabel: string;
  distanceMeters: number;
  durationSeconds: number;
  distanceRemainingMeters: number | null;
  nextToll: NextToll | null;
  tollCount: number;
  totalTollAmount: number | null;
  hasUnresolvedDeviation: boolean;
}

export interface RouteComparison {
  distanceMetersDiff: number;
  durationSecondsDiff: number;
  tollCountDiff: number;
  totalTollAmountDiff: number | null;
}
