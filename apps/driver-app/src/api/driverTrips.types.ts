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

// Fase 43 -- catalogo ampliado (espelha o enum TripStopType do backend,
// mesmo principio ja documentado em trip-stop-type-groups.constants.ts:
// "admin-web/driver-app espelham este mesmo agrupamento em seus proprios
// arquivos de labels"). Todos os valores anteriores (Fase 25) continuam
// validos -- nenhum removido/renomeado.
export type TripStopType =
  | 'UNKNOWN'
  | 'FUEL'
  | 'REST'
  | 'MEAL'
  | 'MAINTENANCE'
  | 'OTHER'
  | 'LOADING'
  | 'UNLOADING'
  | 'WAITING_LOADING'
  | 'WAITING_UNLOADING'
  | 'YARD'
  | 'CUSTOMER'
  | 'GARAGE'
  | 'BREAKDOWN'
  | 'TIRE'
  | 'CONGESTION'
  | 'ACCIDENT'
  | 'ROAD_CLOSURE'
  | 'INSPECTION'
  | 'PERSONAL_NEED'
  | 'DOCUMENTATION'
  | 'WAITING_AUTHORIZATION';
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

// Fase 56 -- comprovante de entrega. Visao MINIMA do FiscalDocument que o
// app do motorista realmente consome (nunca a entity administrativa
// inteira -- mesmo principio de DriverRoute acima).
export type DeliveryProofStatus = 'PENDING' | 'VALID' | 'INVALID' | 'CANCELLED';

export interface DeliveryProof {
  id: string;
  tripId: string | null;
  status: DeliveryProofStatus;
  fileName: string | null;
  issueDate: string | null;
  createdAt: string;
}

export interface SubmitDeliveryProofInput {
  deviceEventId: string;
  observation?: string;
  capturedAt?: string;
}

// Fase 67 -- ocorrencias e jornada do motorista.
export type TripOccurrenceType =
  | 'ACCIDENT'
  | 'BREAKDOWN'
  | 'DELAY'
  | 'ROUTE_DEVIATION'
  | 'DELIVERY_PROBLEM'
  | 'DOCUMENT_PROBLEM'
  | 'VEHICLE_PROBLEM'
  | 'FUEL_PROBLEM'
  | 'TIRE_PROBLEM'
  | 'OTHER';
export type TripOccurrenceSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type TripOccurrenceStatus = 'OPEN' | 'RESOLVED' | 'CANCELLED';

export interface TripOccurrence {
  id: string;
  tripId: string;
  type: TripOccurrenceType;
  severity: TripOccurrenceSeverity;
  status: TripOccurrenceStatus;
  description: string;
  occurredAt: string;
}

export interface CreateOccurrenceInput {
  deviceEventId: string;
  type: TripOccurrenceType;
  severity?: TripOccurrenceSeverity;
  description: string;
  occurredAt: string;
  latitude?: number;
  longitude?: number;
}

// Jornada: status sempre derivado pelo backend (endedAt/cancelledAt),
// idempotencia por ESTADO (nao por deviceEventId -- ver comentario em
// syncQueue.ts, mesmo principio de pause/resume/complete de viagem).
export type DriverShiftStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';

export interface ShiftBreak {
  id: string;
  type: TripStopType;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
}

export interface DriverShift {
  id: string;
  tripId: string | null;
  status: DriverShiftStatus;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  workedMinutes: number | null;
  breaks: ShiftBreak[];
}
