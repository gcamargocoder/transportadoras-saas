import type { Paginated, PaginationParams } from '../../types/api';
import type { OperationalBillingDashboardEntity, TripBillingEntity } from '../../types/entities';
import type { TripBillingStatus } from '../../types/enums';
import { api } from './http';

export interface FindTripBillingsQuery extends PaginationParams {
  startDate?: string | undefined;
  endDate?: string | undefined;
  customerId?: string | undefined;
  fleetId?: string | undefined;
  vehicleId?: string | undefined;
  driverId?: string | undefined;
  status?: TripBillingStatus | undefined;
}

export function listTripBillings(query: FindTripBillingsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<TripBillingEntity>>('/operational-billing', query, signal);
}

export function getBillingDashboard(query: FindTripBillingsQuery = {}, signal?: AbortSignal) {
  return api.get<OperationalBillingDashboardEntity>('/operational-billing/dashboard', query, signal);
}

export function getTripBilling(tripId: string) {
  return api.get<TripBillingEntity>(`/operational-billing/trips/${tripId}`);
}

export interface InvoiceTripBillingPayload {
  amount?: number | undefined;
  notes?: string | undefined;
}

export function invoiceTripBilling(tripId: string, payload: InvoiceTripBillingPayload = {}) {
  return api.post<TripBillingEntity>(`/operational-billing/trips/${tripId}/invoice`, payload);
}

export interface UpdateTripBillingPayload {
  status?: 'PAID' | undefined;
  notes?: string | undefined;
}

export function updateTripBilling(tripId: string, payload: UpdateTripBillingPayload) {
  return api.patch<TripBillingEntity>(`/operational-billing/trips/${tripId}`, payload);
}

export function cancelTripBilling(tripId: string) {
  return api.post<TripBillingEntity>(`/operational-billing/trips/${tripId}/cancel`, {});
}
