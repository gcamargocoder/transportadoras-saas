import type { Paginated, PaginationParams } from '../../types/api';
import type {
  ApplyTripRoutingSuggestionEntity,
  CustomerContactEntity,
  CustomerEntity,
  CustomerNoteEntity,
  CustomerSummaryEntity,
  DeliveryOccurrenceListItemEntity,
  DeliveryOccurrencesDashboardEntity,
  DeliveryStopListItemEntity,
  DeliveryStopsDashboardEntity,
  DriverShiftEntity,
  EmptyTripEntity,
  FleetOptimizationResultEntity,
  LocationEntity,
  RouteEventEntity,
  RouteVersionEntity,
  TollReconciliationEntity,
  TripDeliveryStopEntity,
  TripEntity,
  TripEtaResultEntity,
  TripFinancialDashboardEntity,
  TripFinancialResultEntity,
  TripFinancialSummaryEntity,
  TripMetricsEntity,
  TripOccurrenceEntity,
  TripOperationsListEntity,
  TripRoutingSuggestionEntity,
  TripSettlementEntity,
  TripSummaryEntity,
  TripTimelineEventEntity,
} from '../../types/entities';
import type {
  LocationType,
  TripDeliveryStopStatus,
  TripOccurrenceSeverity,
  TripOccurrenceStatus,
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
  // Fase 101 -- vinculo direto com a parada/entrega especifica (Fase 88).
  tripDeliveryStopId?: string | undefined;
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

// Fase 101
export function markTripOccurrenceInProgress(id: string, occurrenceId: string) {
  return api.patch<TripOccurrenceEntity>(`/trips/${id}/occurrences/${occurrenceId}/start`);
}

export function resolveTripOccurrence(id: string, occurrenceId: string) {
  return api.patch<TripOccurrenceEntity>(`/trips/${id}/occurrences/${occurrenceId}/resolve`);
}

export function cancelTripOccurrence(id: string, occurrenceId: string) {
  return api.patch<TripOccurrenceEntity>(`/trips/${id}/occurrences/${occurrenceId}/cancel`);
}

// --- Ocorrencias de Entrega: visao CROSS-TRIP (Fase 101) ---
// Reutiliza a MESMA TripOccurrence do backend -- so acrescenta o contexto
// de viagem/parada, necessario numa listagem que atravessa varias viagens
// (mesmo padrao de listDeliveryStops/getDeliveryStopsDashboard acima).
export interface FindDeliveryOccurrencesQuery extends PaginationParams {
  type?: TripOccurrenceType | undefined;
  severity?: TripOccurrenceSeverity | undefined;
  status?: TripOccurrenceStatus | undefined;
  tripId?: string | undefined;
  tripDeliveryStopId?: string | undefined;
  driverId?: string | undefined;
  vehicleId?: string | undefined;
  search?: string | undefined;
  occurredFrom?: string | undefined;
  occurredTo?: string | undefined;
}

export function listDeliveryOccurrences(query: FindDeliveryOccurrencesQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<DeliveryOccurrenceListItemEntity>>('/delivery-occurrences', query, signal);
}

export function getDeliveryOccurrencesDashboard(
  query: Omit<FindDeliveryOccurrencesQuery, 'status' | 'page' | 'pageSize'> = {},
  signal?: AbortSignal,
) {
  return api.get<DeliveryOccurrencesDashboardEntity>('/delivery-occurrences/dashboard', query, signal);
}

export function getDeliveryOccurrence(id: string) {
  return api.get<DeliveryOccurrenceListItemEntity>(`/delivery-occurrences/${id}`);
}

export function markDeliveryOccurrenceInProgress(id: string) {
  return api.patch<DeliveryOccurrenceListItemEntity>(`/delivery-occurrences/${id}/start`);
}

export function resolveDeliveryOccurrence(id: string) {
  return api.patch<DeliveryOccurrenceListItemEntity>(`/delivery-occurrences/${id}/resolve`);
}

export function cancelDeliveryOccurrence(id: string) {
  return api.patch<DeliveryOccurrenceListItemEntity>(`/delivery-occurrences/${id}/cancel`);
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

// GET /trips/:id/financial-result (Fase 71) -- resultado financeiro real:
// receita contratada/faturada/recebida, custos e metricas por km.
export function getTripFinancialResult(id: string) {
  return api.get<TripFinancialResultEntity>(`/trips/${id}/financial-result`);
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

// --- Customers (CRM -- Fase 93: camada comercial sobre o cadastro de referencia usado por viagens/receitas) ---
export interface FindCustomersQuery extends PaginationParams {
  search?: string | undefined;
  isActive?: boolean | undefined;
}

export interface CreateCustomerPayload {
  name: string;
  document?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  address?: string | undefined;
}

export interface UpdateCustomerPayload extends Partial<CreateCustomerPayload> {
  isActive?: boolean | undefined;
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

export function updateCustomer(id: string, payload: UpdateCustomerPayload) {
  return api.patch<CustomerEntity>(`/customers/${id}`, payload);
}

export function getCustomerSummary(id: string) {
  return api.get<CustomerSummaryEntity>(`/customers/${id}/summary`);
}

export interface CreateCustomerContactPayload {
  name: string;
  role?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  notes?: string | undefined;
  isPrimary?: boolean | undefined;
}

export type UpdateCustomerContactPayload = Partial<CreateCustomerContactPayload>;

export function listCustomerContacts(customerId: string) {
  return api.get<CustomerContactEntity[]>(`/customers/${customerId}/contacts`);
}

export function createCustomerContact(customerId: string, payload: CreateCustomerContactPayload) {
  return api.post<CustomerContactEntity>(`/customers/${customerId}/contacts`, payload);
}

export function updateCustomerContact(customerId: string, contactId: string, payload: UpdateCustomerContactPayload) {
  return api.patch<CustomerContactEntity>(`/customers/${customerId}/contacts/${contactId}`, payload);
}

export function deleteCustomerContact(customerId: string, contactId: string) {
  return api.delete<void>(`/customers/${customerId}/contacts/${contactId}`);
}

export function listCustomerNotes(customerId: string) {
  return api.get<CustomerNoteEntity[]>(`/customers/${customerId}/notes`);
}

export function createCustomerNote(customerId: string, content: string) {
  return api.post<CustomerNoteEntity>(`/customers/${customerId}/notes`, { content });
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

// --- Paradas/entregas planejadas (Fase 88) ---
export interface CreateTripDeliveryStopPayload {
  customerId?: string | undefined;
  locationId: string;
  plannedArrival?: string | undefined;
  notes?: string | undefined;
}

export type UpdateTripDeliveryStopPayload = Partial<Omit<CreateTripDeliveryStopPayload, 'customerId'>> & {
  customerId?: string | null | undefined;
};

export function getTripDeliveryStops(tripId: string) {
  return api.get<TripDeliveryStopEntity[]>(`/trips/${tripId}/delivery-stops`);
}

export function createTripDeliveryStop(tripId: string, payload: CreateTripDeliveryStopPayload) {
  return api.post<TripDeliveryStopEntity>(`/trips/${tripId}/delivery-stops`, payload);
}

export function updateTripDeliveryStop(
  tripId: string,
  stopId: string,
  payload: UpdateTripDeliveryStopPayload,
) {
  return api.patch<TripDeliveryStopEntity>(`/trips/${tripId}/delivery-stops/${stopId}`, payload);
}

// reason (Fase 99): obrigatorio quando status=FAILED, validado no backend.
export function updateTripDeliveryStopStatus(
  tripId: string,
  stopId: string,
  status: TripDeliveryStopStatus,
  reason?: string,
) {
  return api.patch<TripDeliveryStopEntity>(`/trips/${tripId}/delivery-stops/${stopId}/status`, {
    status,
    ...(reason ? { reason } : {}),
  });
}

export function removeTripDeliveryStop(tripId: string, stopId: string) {
  return api.delete<void>(`/trips/${tripId}/delivery-stops/${stopId}`);
}

export function reorderTripDeliveryStops(tripId: string, items: { id: string; sequence: number }[]) {
  return api.put<TripDeliveryStopEntity[]>(`/trips/${tripId}/delivery-stops/reorder`, { items });
}

// --- Gestao de Entregas: visao CROSS-TRIP (Fase 99) ---
export interface FindDeliveryStopsQuery extends PaginationParams {
  status?: TripDeliveryStopStatus | undefined;
  customerId?: string | undefined;
  tripId?: string | undefined;
  search?: string | undefined;
  plannedFrom?: string | undefined;
  plannedTo?: string | undefined;
  late?: boolean | undefined;
}

export function listDeliveryStops(query: FindDeliveryStopsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<DeliveryStopListItemEntity>>('/delivery-stops', query, signal);
}

export function getDeliveryStopsDashboard(
  query: Omit<FindDeliveryStopsQuery, 'status' | 'late' | 'page' | 'pageSize'> = {},
  signal?: AbortSignal,
) {
  return api.get<DeliveryStopsDashboardEntity>('/delivery-stops/dashboard', query, signal);
}

// --- Roteirização de paradas/entregas (Fase 89) ---
export function getTripRoutingSuggestion(tripId: string) {
  return api.get<TripRoutingSuggestionEntity>(`/trips/${tripId}/delivery-stops/routing-suggestion`);
}

export function applyTripRoutingSuggestion(tripId: string) {
  return api.post<ApplyTripRoutingSuggestionEntity>(
    `/trips/${tripId}/delivery-stops/routing-suggestion/apply`,
  );
}

// --- Otimização de frota (Fase 90) ---
// Somente leitura -- "aplicar" um candidato e o updateTrip(...) ja existente
// acima (compositionId/driverId), nunca um endpoint novo.
export function getTripFleetOptimization(tripId: string) {
  return api.get<FleetOptimizationResultEntity>(`/trips/${tripId}/fleet-optimization`);
}

// --- Previsão de chegada / ETA (Fase 91) ---
// Sempre calculada sob demanda pelo backend -- nunca persistida.
export function getTripEta(tripId: string) {
  return api.get<TripEtaResultEntity>(`/trips/${tripId}/delivery-stops/eta`);
}

// --- Viagens vazias (Fase 92) ---
// Trip.loadStatus = EMPTY, informado pelo motorista na largada -- nunca
// inferido de ausência de cliente/entrega.
export interface FindEmptyTripsQuery extends PaginationParams {
  driverId?: string | undefined;
  vehicleId?: string | undefined;
  status?: TripStatus | undefined;
  departureFrom?: string | undefined;
  departureTo?: string | undefined;
}

export function listEmptyTrips(query: FindEmptyTripsQuery, signal?: AbortSignal) {
  return api.get<Paginated<EmptyTripEntity>>('/trips/empty-runs', query, signal);
}
