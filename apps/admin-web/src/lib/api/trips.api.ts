import type { Paginated, PaginationParams } from '../../types/api';
import type {
  CustomerEntity,
  DriverShiftEntity,
  LocationEntity,
  RouteEventEntity,
  RouteVersionEntity,
  TollReconciliationEntity,
  TripEntity,
  TripFinancialDashboardEntity,
  TripFinancialSummaryEntity,
  TripMetricsEntity,
  TripOccurrenceEntity,
  TripOperationsListEntity,
  TripSettlementEntity,
  TripSummaryEntity,
  TripTimelineEventEntity,
} from '../../types/entities';
import type {
  LocationType,
  TripOccurrenceSeverity,
  TripOccurrenceType,
  TripPriority,
  TripStatus,
  TripTimelineOrigin,
} from '../../types/enums';
import { api } from './http';

export interface FindTripsQuery extends PaginationParams {
  search?: string | undefined;
  customerId?: string | undefined;
  driverId?: string | undefined;
  vehicleId?: string | undefined;
  originLocationId?: string | undefined;
  destinationLocationId?: string | undefined;
  status?: TripStatus | undefined;
  departureFrom?: string | undefined;
  departureTo?: string | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface CreateTripPayload {
  customerId?: string | undefined;
  originLocationId: string;
  destinationLocationId: string;
  driverId: string;
  compositionId: string;
  tollRouteId?: string | undefined;
  plannedDeparture: string;
  plannedArrival: string;
  priority?: TripPriority | undefined;
  notes?: string | undefined;
}

// tollRouteId aceita null (para desvincular a rota) alem de string/undefined
// -- Partial<CreateTripPayload> sozinho nao permitiria expressar "limpar".
export type UpdateTripPayload = Partial<Omit<CreateTripPayload, 'tollRouteId'>> & {
  tollRouteId?: string | null | undefined;
};

export function listTrips(query: FindTripsQuery, signal?: AbortSignal) {
  return api.get<Paginated<TripEntity>>('/trips', query, signal);
}

export function getTrip(id: string) {
  return api.get<TripEntity>(`/trips/${id}`);
}

// GET /trips/operations/active (Fase 29) -- painel de monitoramento
// operacional; registrado ANTES de getTrip nas chamadas para nunca colidir
// com /trips/:id no backend (rota fixa de 2 segmentos).
export function getActiveOperations(signal?: AbortSignal) {
  return api.get<TripOperationsListEntity>('/trips/operations/active', undefined, signal);
}

export function createTrip(payload: CreateTripPayload) {
  return api.post<TripEntity>('/trips', payload);
}

export function updateTrip(id: string, payload: UpdateTripPayload) {
  return api.patch<TripEntity>(`/trips/${id}`, payload);
}

export function updateTripStatus(id: string, status: TripStatus) {
  return api.patch<TripEntity>(`/trips/${id}/status`, { status });
}

export function cancelTrip(id: string, reason?: string) {
  return api.patch<TripEntity>(`/trips/${id}/cancel`, reason ? { reason } : undefined);
}

export function deleteTrip(id: string) {
  return api.delete<void>(`/trips/${id}`);
}

// /trips/:id/timeline (Fase 67) -- projecao unificada de eventos reais
// (paradas, eventos de rota, abastecimentos, pedagios, eixos, checklists,
// documentos fiscais/comprovante de entrega, despesas, receitas,
// ocorrencias e auditoria). Antes da Fase 67 devolvia so AuditLog.
export interface FindTripTimelineQuery extends PaginationParams {
  origin?: TripTimelineOrigin | undefined;
  type?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  order?: 'asc' | 'desc' | undefined;
}

export function getTripTimeline(id: string, params?: FindTripTimelineQuery) {
  return api.get<Paginated<TripTimelineEventEntity>>(`/trips/${id}/timeline`, params);
}

// --- Ocorrencias (Fase 67) ---
export interface CreateTripOccurrencePayload {
  type: TripOccurrenceType;
  severity?: TripOccurrenceSeverity | undefined;
  description: string;
  occurredAt: string;
  driverId?: string | undefined;
  vehicleId?: string | undefined;
  latitude?: number | undefined;
  longitude?: number | undefined;
  locationLabel?: string | undefined;
  attachmentId?: string | undefined;
}

export function getTripOccurrences(id: string) {
  return api.get<TripOccurrenceEntity[]>(`/trips/${id}/occurrences`);
}

export function createTripOccurrence(id: string, payload: CreateTripOccurrencePayload) {
  return api.post<TripOccurrenceEntity>(`/trips/${id}/occurrences`, payload);
}

export function resolveTripOccurrence(id: string, occurrenceId: string) {
  return api.patch<TripOccurrenceEntity>(`/trips/${id}/occurrences/${occurrenceId}/resolve`);
}

export function cancelTripOccurrence(id: string, occurrenceId: string) {
  return api.patch<TripOccurrenceEntity>(`/trips/${id}/occurrences/${occurrenceId}/cancel`);
}

// --- Jornada do motorista (Fase 67, leitura administrativa) ---
export function getTripShifts(id: string) {
  return api.get<DriverShiftEntity[]>(`/trips/${id}/shifts`);
}

export function getTripSummary(id: string) {
  return api.get<TripSummaryEntity>(`/trips/${id}/summary`);
}

export function getTripMetrics(id: string) {
  return api.get<TripMetricsEntity>(`/trips/${id}/metrics`);
}

export function getTripRouteVersions(id: string) {
  return api.get<RouteVersionEntity[]>(`/trips/${id}/route-versions`);
}

export function getTripRouteEvents(id: string) {
  return api.get<RouteEventEntity[]>(`/trips/${id}/route-events`);
}

export function getTripFinancialSummary(id: string) {
  return api.get<TripFinancialSummaryEntity>(`/trips/${id}/financial-summary`);
}

export function getTripSettlement(id: string) {
  return api.get<TripSettlementEntity>(`/trips/${id}/settlement`);
}

export function closeTripSettlement(id: string, notes?: string) {
  return api.post<TripSettlementEntity>(
    `/trips/${id}/settlement/close`,
    notes ? { notes } : undefined,
  );
}

export function reopenTripSettlement(id: string, notes?: string) {
  return api.post<TripSettlementEntity>(
    `/trips/${id}/settlement/reopen`,
    notes ? { notes } : undefined,
  );
}

export function getTripFinancialDashboard(id: string) {
  return api.get<TripFinancialDashboardEntity>(`/trips/${id}/financial-dashboard`);
}

// Conciliacao de pedagio (Fase 23) -- compara as pracas esperadas pela rota
// vinculada com os pedagios efetivamente registrados na viagem.
export function getTripTollReconciliation(id: string) {
  return api.get<TollReconciliationEntity>(`/trips/${id}/toll-reconciliation`);
}

// Acao explicita "Conciliar agora" (Fase 24) -- mesmo resultado do GET
// acima, formalizado como acao (nao altera nenhuma transacao historica).
export function runTripTollReconciliation(id: string) {
  return api.post<TollReconciliationEntity>(`/trips/${id}/toll-reconciliation/run`);
}

// --- Customers (cadastro de referencia usado por viagens/receitas) ---
export interface FindCustomersQuery extends PaginationParams {
  search?: string | undefined;
}

export interface CreateCustomerPayload {
  name: string;
  document?: string | undefined;
}

export function listCustomers(query: FindCustomersQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<CustomerEntity>>('/customers', query, signal);
}

export function getCustomer(id: string) {
  return api.get<CustomerEntity>(`/customers/${id}`);
}

export function createCustomer(payload: CreateCustomerPayload) {
  return api.post<CustomerEntity>('/customers', payload);
}

// --- Locations (origem/destino de viagens) ---
export interface FindLocationsQuery extends PaginationParams {
  search?: string | undefined;
  type?: LocationType | undefined;
}

export interface CreateLocationPayload {
  name: string;
  type: LocationType;
  address?: string | undefined;
}

export function listLocations(query: FindLocationsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<LocationEntity>>('/locations', query, signal);
}

export function getLocation(id: string) {
  return api.get<LocationEntity>(`/locations/${id}`);
}

export function createLocation(payload: CreateLocationPayload) {
  return api.post<LocationEntity>('/locations', payload);
}
