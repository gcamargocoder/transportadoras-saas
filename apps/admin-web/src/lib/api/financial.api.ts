import type { Paginated, PaginationParams } from '../../types/api';
import type { TripAdvanceEntity, TripExpenseEntity, TripRevenueEntity } from '../../types/entities';
import type {
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseStatus,
  RevenueCategory,
} from '../../types/enums';
import { api } from './http';

// --- Trip expenses (despesas de viagem) ---
export interface FindTripExpensesQuery extends PaginationParams {
  tripId?: string | undefined;
  category?: ExpenseCategory | undefined;
  status?: ExpenseStatus | undefined;
  driverId?: string | undefined;
  vehicleId?: string | undefined;
  supplier?: string | undefined;
  expenseDateFrom?: string | undefined;
  expenseDateTo?: string | undefined;
  minAmount?: number | undefined;
  maxAmount?: number | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface CreateTripExpensePayload {
  tripId: string;
  category: ExpenseCategory;
  description: string;
  supplier?: string | undefined;
  documentNumber?: string | undefined;
  expenseDate: string;
  amount: number;
  currency?: string | undefined;
  paymentMethod?: ExpensePaymentMethod | undefined;
  attachmentId?: string | undefined;
}

export function listTripExpenses(query: FindTripExpensesQuery, signal?: AbortSignal) {
  return api.get<Paginated<TripExpenseEntity>>('/trip-expenses', query, signal);
}

export function getTripExpense(id: string) {
  return api.get<TripExpenseEntity>(`/trip-expenses/${id}`);
}

export function createTripExpense(payload: CreateTripExpensePayload) {
  return api.post<TripExpenseEntity>('/trip-expenses', payload);
}

export function updateTripExpense(id: string, payload: Partial<CreateTripExpensePayload>) {
  return api.patch<TripExpenseEntity>(`/trip-expenses/${id}`, payload);
}

export function updateTripExpenseStatus(id: string, status: ExpenseStatus) {
  return api.patch<TripExpenseEntity>(`/trip-expenses/${id}/status`, { status });
}

export function deleteTripExpense(id: string) {
  return api.delete<void>(`/trip-expenses/${id}`);
}

// --- Trip revenues (receitas de viagem) ---
export interface FindTripRevenuesQuery extends PaginationParams {
  tripId?: string | undefined;
  category?: RevenueCategory | undefined;
  customerId?: string | undefined;
  receivedFrom?: string | undefined;
  receivedTo?: string | undefined;
  minAmount?: number | undefined;
  maxAmount?: number | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface CreateTripRevenuePayload {
  tripId: string;
  category: RevenueCategory;
  description: string;
  amount: number;
  receivedAt: string;
  invoiceNumber?: string | undefined;
  customerId?: string | undefined;
  attachmentId?: string | undefined;
}

export function listTripRevenues(query: FindTripRevenuesQuery, signal?: AbortSignal) {
  return api.get<Paginated<TripRevenueEntity>>('/trip-revenues', query, signal);
}

export function getTripRevenue(id: string) {
  return api.get<TripRevenueEntity>(`/trip-revenues/${id}`);
}

export function createTripRevenue(payload: CreateTripRevenuePayload) {
  return api.post<TripRevenueEntity>('/trip-revenues', payload);
}

export function updateTripRevenue(id: string, payload: Partial<CreateTripRevenuePayload>) {
  return api.patch<TripRevenueEntity>(`/trip-revenues/${id}`, payload);
}

export function deleteTripRevenue(id: string) {
  return api.delete<void>(`/trip-revenues/${id}`);
}

// --- Trip advances (adiantamentos ao motorista) ---
export interface FindTripAdvancesQuery extends PaginationParams {
  tripId?: string | undefined;
  driverId?: string | undefined;
  paymentMethod?: ExpensePaymentMethod | undefined;
  paidFrom?: string | undefined;
  paidTo?: string | undefined;
  minAmount?: number | undefined;
  maxAmount?: number | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface CreateTripAdvancePayload {
  tripId: string;
  description: string;
  amount: number;
  paymentMethod?: ExpensePaymentMethod | undefined;
  paidAt: string;
  attachmentId?: string | undefined;
}

export function listTripAdvances(query: FindTripAdvancesQuery, signal?: AbortSignal) {
  return api.get<Paginated<TripAdvanceEntity>>('/trip-advances', query, signal);
}

export function getTripAdvance(id: string) {
  return api.get<TripAdvanceEntity>(`/trip-advances/${id}`);
}

export function createTripAdvance(payload: CreateTripAdvancePayload) {
  return api.post<TripAdvanceEntity>('/trip-advances', payload);
}

export function updateTripAdvance(id: string, payload: Partial<CreateTripAdvancePayload>) {
  return api.patch<TripAdvanceEntity>(`/trip-advances/${id}`, payload);
}

export function deleteTripAdvance(id: string) {
  return api.delete<void>(`/trip-advances/${id}`);
}
