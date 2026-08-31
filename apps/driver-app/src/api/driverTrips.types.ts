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

// Fase 88 -- paradas/entregas PLANEJADAS da viagem (sequencia/cliente/local/
// status), distinta de TripStop abaixo (parada OPERACIONAL detectada pelo
// app por tempo parado). Somente LEITURA nesta fase -- escrita continua
// exclusiva do painel administrativo; navegacao/atualizacao de status pelo
// motorista fica para fase futura. `sequence` ja reflete automaticamente
// qualquer roteirizacao aplicada pelo escritorio (Fase 89, ver
// docs/trip-routing.md) -- nenhum campo/endpoint novo foi necessario aqui:
// aplicar uma sugestao apenas reordena os MESMOS registros que este tipo ja
// espelha.
// Fase 99 -- FAILED: entrega tentada mas nao concluida (distinta de
// CANCELLED, removida do planejamento sem tentativa). actualArrival/
// deliveredAt sao a EXECUCAO real (previsao continua em plannedArrival),
// sempre derivados pelo backend -- nunca informados pelo app.
export type TripDeliveryStopStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'FAILED';

export interface TripDeliveryStop {
  id: string;
  tripId: string;
  sequence: number;
  customerId: string | null;
  customerName: string | null;
  locationId: string;
  locationName: string;
  locationAddress: string | null;
  status: TripDeliveryStopStatus;
  plannedArrival: string | null;
  actualArrival: string | null;
  deliveredAt: string | null;
  failureReason: string | null;
  notes: string | null;
}

// Fase 91 -- previsao de chegada (ETA), SEMPRE calculada sob demanda pelo
// backend (nunca persistida) -- espelha apps/api/src/trips/entities/
// trip-eta.entity.ts. Somente leitura nesta fase (sem GPS/navegacao no
// app ainda).
export type TripEtaSource = 'GEOGRAPHIC' | 'DELAY_SHIFT' | 'NONE';

export interface TripDeliveryStopEta {
  stopId: string;
  sequence: number;
  status: TripDeliveryStopStatus;
  isNextStop: boolean;
  plannedArrival: string | null;
  estimatedArrival: string | null;
  source: TripEtaSource;
  basis: string | null;
  varianceSeconds: number | null;
  delayed: boolean | null;
  limitation: string | null;
}

export interface TripEtaResult {
  tripId: string;
  generatedAt: string;
  nextStopId: string | null;
  tripPlannedArrival: string | null;
  tripEstimatedArrival: string | null;
  tripEstimatedArrivalSource: TripEtaSource;
  tripEstimatedArrivalBasis: string | null;
  tripVarianceSeconds: number | null;
  tripDelayed: boolean | null;
  stops: TripDeliveryStopEta[];
  limitations: string[];
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

// Espelha FuelType do backend (packages/database/prisma/schema.prisma) --
// gap real encontrado na auditoria "TMS + Driver App": o app nunca
// perguntava o tipo, todo abastecimento registrado em campo caia em OUTRO
// (default do backend quando omitido), misturando diesel/ARLA nos
// relatorios administrativos.
export type FuelType = 'DIESEL_S10' | 'DIESEL_S500' | 'GASOLINA' | 'ETANOL' | 'ARLA32' | 'OUTRO';

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
  // Fase 100 -- vinculo direto com a parada/entrega especifica (Fase 88),
  // quando informado na submissao.
  tripDeliveryStopId: string | null;
  status: DeliveryProofStatus;
  fileName: string | null;
  issueDate: string | null;
  createdAt: string;
}

export interface SubmitDeliveryProofInput {
  deviceEventId: string;
  // Fase 100 -- parada/entrega especifica desta viagem (TripDeliveryStop),
  // quando a viagem usa paradas planejadas. Precisa estar COMPLETED --
  // validado pelo backend, nunca neste tipo. Opcional: viagens simples
  // (sem paradas) continuam funcionando sem este campo.
  tripDeliveryStopId?: string;
  observation?: string;
  capturedAt?: string;
}

// Fase 67 -- ocorrencias e jornada do motorista. Fase 101 -- catalogo de
// ocorrencias de ENTREGA (4 novos tipos) + escala LOW/MEDIUM/HIGH (alem da
// INFO/WARNING/CRITICAL ja existente -- as duas escalas convivem no mesmo
// campo, nunca uma redefine a outra) + status IN_PROGRESS + vinculo com
// tripDeliveryStopId.
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
  | 'OTHER'
  | 'RECIPIENT_ABSENT'
  | 'WRONG_ADDRESS'
  | 'DELIVERY_REFUSED'
  | 'CARGO_DAMAGE';
export type TripOccurrenceSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'LOW' | 'MEDIUM' | 'HIGH';
export type TripOccurrenceStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';

export interface TripOccurrence {
  id: string;
  tripId: string;
  // Fase 101 -- vinculo direto com a parada/entrega especifica (Fase 88).
  tripDeliveryStopId: string | null;
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
  // Fase 101 -- parada/entrega especifica desta viagem, quando aplicavel.
  // Validado no backend (deve pertencer a esta viagem).
  tripDeliveryStopId?: string;
  latitude?: number;
  longitude?: number;
}

// Fase 102 -- documento/evidencia (OCCURRENCE_EVIDENCE) vinculado a uma
// ocorrencia especifica. Mesmo mecanismo generico de FiscalDocument ja
// usado por DeliveryProof acima -- nunca um storage paralelo.
export interface OccurrenceEvidence {
  id: string;
  tripId: string | null;
  tripOccurrenceId: string | null;
  status: DeliveryProofStatus;
  fileName: string | null;
  issueDate: string | null;
  createdAt: string;
}

export interface SubmitOccurrenceEvidenceInput {
  deviceEventId: string;
  observation?: string;
  capturedAt?: string;
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
