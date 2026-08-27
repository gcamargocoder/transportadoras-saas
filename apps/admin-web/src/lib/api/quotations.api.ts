import type { AuditLogEntity, QuotationEntity } from '../../types/entities';
import type { QuotationStatus, VehicleType } from '../../types/enums';
import type { Paginated, PaginationParams } from '../../types/api';
import { api } from './http';

// Fase 94 -- Cotacoes. Reaproveita o motor de precificacao existente
// (backend chama FreightPricingService.simulate) -- o frontend so envia os
// parametros e recebe o resultado ja resolvido na propria QuotationEntity.
export interface FindQuotationsQuery extends PaginationParams {
  customerId?: string | undefined;
  status?: QuotationStatus | undefined;
  search?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export function listQuotations(query: FindQuotationsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<QuotationEntity>>('/quotations', query, signal);
}

export function getQuotation(id: string) {
  return api.get<QuotationEntity>(`/quotations/${id}`);
}

export function getQuotationHistory(id: string, query: PaginationParams = {}) {
  return api.get<Paginated<AuditLogEntity>>(`/quotations/${id}/history`, query);
}

export interface CreateQuotationPayload {
  customerId: string;
  customerContactId?: string | undefined;
  originLocationId: string;
  destinationLocationId: string;
  cargoType?: string | undefined;
  weightKg?: number | undefined;
  cubageM3?: number | undefined;
  vehicleType?: VehicleType | undefined;
  conditions?: string | undefined;
  validUntil: string;
  freightTableId?: string | undefined;
  nightService?: boolean | undefined;
  riskCargo?: boolean | undefined;
  dailyCount?: number | undefined;
  demurrageCount?: number | undefined;
  manualAmount?: number | undefined;
}

export function createQuotation(payload: CreateQuotationPayload) {
  return api.post<QuotationEntity>('/quotations', payload);
}

export type UpdateQuotationPayload = Partial<CreateQuotationPayload>;

export function updateQuotation(id: string, payload: UpdateQuotationPayload) {
  return api.patch<QuotationEntity>(`/quotations/${id}`, payload);
}

export function updateQuotationStatus(id: string, status: QuotationStatus) {
  return api.patch<QuotationEntity>(`/quotations/${id}/status`, { status });
}

export interface ConvertQuotationToTripPayload {
  driverId: string;
  compositionId: string;
  tollRouteId?: string | undefined;
  plannedDeparture: string;
  plannedArrival: string;
  priority?: string | undefined;
}

export function convertQuotationToTrip(id: string, payload: ConvertQuotationToTripPayload) {
  return api.post<QuotationEntity>(`/quotations/${id}/convert-to-trip`, payload);
}
