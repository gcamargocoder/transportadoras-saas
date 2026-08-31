import type { Paginated, PaginationParams } from '../../types/api';
import type {
  ImportJobEntity,
  ImportJobErrorEntity,
  TollAuditVerdict,
  TollDashboardEntity,
  TollPlazaEntity,
  TollTransactionEntity,
} from '../../types/entities';
import type { TollPlazaType, TollTransactionSource, TollTransactionStatus } from '../../types/enums';
import { api } from './http';

export interface FindTollTransactionsQuery extends PaginationParams {
  tripId?: string | undefined;
  vehicleId?: string | undefined;
  fleetId?: string | undefined;
  driverId?: string | undefined;
  tagProviderId?: string | undefined;
  tollPlazaId?: string | undefined;
  status?: TollTransactionStatus | undefined;
  auditVerdict?: TollAuditVerdict | undefined;
  chargedFrom?: string | undefined;
  chargedTo?: string | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface CreateTollTransactionPayload {
  tripId: string;
  tollPlazaId: string;
  axleCount: number;
  chargedAmount: number;
  chargedAt: string;
  source?: TollTransactionSource | undefined;
}

export function listTollTransactions(query: FindTollTransactionsQuery, signal?: AbortSignal) {
  return api.get<Paginated<TollTransactionEntity>>('/toll-transactions', query, signal);
}

export function getTollTransaction(id: string) {
  return api.get<TollTransactionEntity>(`/toll-transactions/${id}`);
}

export function createTollTransaction(payload: CreateTollTransactionPayload) {
  return api.post<TollTransactionEntity>('/toll-transactions', payload);
}

export function updateTollTransaction(id: string, payload: Partial<CreateTollTransactionPayload>) {
  return api.patch<TollTransactionEntity>(`/toll-transactions/${id}`, payload);
}

export function deleteTollTransaction(id: string) {
  return api.delete<void>(`/toll-transactions/${id}`);
}

export function getTollDashboard(query: FindTollTransactionsQuery = {}, signal?: AbortSignal) {
  return api.get<TollDashboardEntity>('/toll-transactions/dashboard', query, signal);
}

// --- Toll plazas (praças de pedágio, dado global) ---
export interface FindTollPlazasQuery extends PaginationParams {
  search?: string | undefined;
  state?: string | undefined;
  operator?: string | undefined;
}

export function listTollPlazas(query: FindTollPlazasQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<TollPlazaEntity>>('/toll-plazas', query, signal);
}

export function getTollPlaza(id: string) {
  return api.get<TollPlazaEntity>(`/toll-plazas/${id}`);
}

export interface CreateTollPlazaPayload {
  name: string;
  operator: string;
  type?: TollPlazaType | undefined;
  highway?: string | undefined;
  km?: number | undefined;
  city?: string | undefined;
  state?: string | undefined;
  latitude?: number | undefined;
  longitude?: number | undefined;
  pricePerAxle?: number | undefined;
}

export function createTollPlaza(payload: CreateTollPlazaPayload) {
  return api.post<TollPlazaEntity>('/toll-plazas', payload);
}

export function updateTollPlaza(id: string, payload: Partial<CreateTollPlazaPayload>) {
  return api.patch<TollPlazaEntity>(`/toll-plazas/${id}`, payload);
}

export function deleteTollPlaza(id: string) {
  return api.delete<void>(`/toll-plazas/${id}`);
}

// --- Importação de extratos ---
export interface FindImportJobsQuery extends PaginationParams {
  providerId?: string | undefined;
  status?: string | undefined;
}

export function listImportJobs(query: FindImportJobsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<ImportJobEntity>>('/toll-import', query, signal);
}

export function getImportJob(id: string) {
  return api.get<ImportJobEntity>(`/toll-import/${id}`);
}

export function getImportJobErrors(id: string, query: PaginationParams = {}) {
  return api.get<Paginated<ImportJobErrorEntity>>(`/toll-import/${id}/errors`, query);
}

export function uploadTollStatement(file: File, providerId: string): Promise<ImportJobEntity> {
  const form = new FormData();
  form.append('file', file);
  form.append('providerId', providerId);
  return api.post<ImportJobEntity>('/toll-import', form, { isForm: true });
}
