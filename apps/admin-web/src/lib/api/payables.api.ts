import type { Paginated, PaginationParams, QueryableParams } from '../../types/api';
import type { PayableEntity, PayablesDashboardEntity } from '../../types/entities';
import type { ExpenseCategory, ExpensePaymentMethod, PayableEffectiveStatus } from '../../types/enums';
import { api } from './http';

export interface FindPayablesQuery extends PaginationParams {
  search?: string | undefined;
  tripId?: string | undefined;
  category?: ExpenseCategory | undefined;
  status?: PayableEffectiveStatus | undefined;
  from?: string | undefined;
  to?: string | undefined;
  dueFrom?: string | undefined;
  dueTo?: string | undefined;
}

export function listPayables(query: FindPayablesQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<PayableEntity>>('/payables', query, signal);
}

export interface FindPayablesDashboardQuery extends QueryableParams {
  tripId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export function getPayablesDashboard(query: FindPayablesDashboardQuery = {}, signal?: AbortSignal) {
  return api.get<PayablesDashboardEntity>('/payables/dashboard', query, signal);
}

export function getPayable(id: string) {
  return api.get<PayableEntity>(`/payables/${id}`);
}

export interface GeneratePayablePayload {
  dueDate: string;
  description?: string | undefined;
}

export function generatePayableFromExpense(expenseId: string, payload: GeneratePayablePayload) {
  return api.post<PayableEntity>(`/payables/from-expense/${expenseId}`, payload);
}

export interface CreatePayablePayload {
  supplierName?: string | undefined;
  category: ExpenseCategory;
  description: string;
  originalAmount: number;
  issueDate: string;
  dueDate: string;
  installments?: number | undefined;
  // Documento fiscal de origem (autopreenchimento) -- ver GET /fiscal/documents/:id.
  fiscalDocumentId?: string | undefined;
}

export function createPayable(payload: CreatePayablePayload) {
  return api.post<PayableEntity[]>('/payables', payload);
}

export interface RegisterPayablePaymentPayload {
  amount: number;
  paymentDate: string;
  paymentMethod: ExpensePaymentMethod;
  // Fase 79 -- sempre obrigatorio, nunca escolhido automaticamente.
  financialAccountId: string;
  reference?: string | undefined;
  notes?: string | undefined;
  interestAmount?: number | undefined;
  fineAmount?: number | undefined;
  discountAmount?: number | undefined;
}

export function registerPayablePayment(id: string, payload: RegisterPayablePaymentPayload) {
  return api.post<PayableEntity>(`/payables/${id}/payments`, payload);
}

export function cancelPayable(id: string) {
  return api.post<PayableEntity>(`/payables/${id}/cancel`, {});
}
