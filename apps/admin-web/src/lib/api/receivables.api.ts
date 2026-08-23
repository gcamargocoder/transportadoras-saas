import type { Paginated, PaginationParams, QueryableParams } from '../../types/api';
import type { ReceivableEntity, ReceivablesDashboardEntity } from '../../types/entities';
import type { ReceivableEffectiveStatus, ReceivablePaymentMethod } from '../../types/enums';
import { api } from './http';

export interface FindReceivablesQuery extends PaginationParams {
  search?: string | undefined;
  customerId?: string | undefined;
  tripId?: string | undefined;
  status?: ReceivableEffectiveStatus | undefined;
  from?: string | undefined;
  to?: string | undefined;
  dueFrom?: string | undefined;
  dueTo?: string | undefined;
}

export function listReceivables(query: FindReceivablesQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<ReceivableEntity>>('/receivables', query, signal);
}

export interface FindReceivablesDashboardQuery extends QueryableParams {
  customerId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export function getReceivablesDashboard(query: FindReceivablesDashboardQuery = {}, signal?: AbortSignal) {
  return api.get<ReceivablesDashboardEntity>('/receivables/dashboard', query, signal);
}

export function getReceivable(id: string) {
  return api.get<ReceivableEntity>(`/receivables/${id}`);
}

export interface GenerateReceivablePayload {
  dueDate: string;
  description?: string | undefined;
}

export function generateReceivableFromBilling(billingId: string, payload: GenerateReceivablePayload) {
  return api.post<ReceivableEntity>(`/receivables/from-billing/${billingId}`, payload);
}

export interface RegisterReceivablePaymentPayload {
  amount: number;
  paymentDate: string;
  paymentMethod: ReceivablePaymentMethod;
  reference?: string | undefined;
  notes?: string | undefined;
}

export function registerReceivablePayment(id: string, payload: RegisterReceivablePaymentPayload) {
  return api.post<ReceivableEntity>(`/receivables/${id}/payments`, payload);
}

export function cancelReceivable(id: string) {
  return api.post<ReceivableEntity>(`/receivables/${id}/cancel`, {});
}
