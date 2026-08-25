import type { Paginated, PaginationParams } from '../../types/api';
import type { PartEntity, PartsDashboardEntity, PartStockMovementEntity } from '../../types/entities';
import type { PartStockMovementType } from '../../types/enums';
import { api } from './http';

export interface FindPartsQuery extends PaginationParams {
  search?: string | undefined;
  category?: string | undefined;
  isActive?: boolean | undefined;
  lowStock?: boolean | undefined;
  zeroStock?: boolean | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface CreatePartPayload {
  sku: string;
  name: string;
  description?: string | undefined;
  unit: string;
  category?: string | undefined;
  manufacturer?: string | undefined;
  oemCode?: string | undefined;
  minStock?: number | undefined;
}

export type UpdatePartPayload = Partial<CreatePartPayload>;

export function listParts(query: FindPartsQuery, signal?: AbortSignal) {
  return api.get<Paginated<PartEntity>>('/parts', query, signal);
}

export function getPartsDashboard(query: { startDate?: string | undefined; endDate?: string | undefined } = {}, signal?: AbortSignal) {
  return api.get<PartsDashboardEntity>('/parts/dashboard', query, signal);
}

export function getPart(id: string) {
  return api.get<PartEntity>(`/parts/${id}`);
}

export function createPart(payload: CreatePartPayload) {
  return api.post<PartEntity>('/parts', payload);
}

export function updatePart(id: string, payload: UpdatePartPayload) {
  return api.patch<PartEntity>(`/parts/${id}`, payload);
}

export function updatePartStatus(id: string, isActive: boolean) {
  return api.patch<PartEntity>(`/parts/${id}/status`, { isActive });
}

export interface RegisterStockInPayload {
  quantity: number;
  unitCost?: number | undefined;
  movementDate?: string | undefined;
  reason?: string | undefined;
  reference?: string | undefined;
  notes?: string | undefined;
}

export function registerStockIn(id: string, payload: RegisterStockInPayload) {
  return api.post<PartEntity>(`/parts/${id}/stock/in`, payload);
}

export interface RegisterStockOutPayload {
  quantity: number;
  movementDate?: string | undefined;
  reason?: string | undefined;
  reference?: string | undefined;
  maintenanceId?: string | undefined;
  notes?: string | undefined;
}

export function registerStockOut(id: string, payload: RegisterStockOutPayload) {
  return api.post<PartEntity>(`/parts/${id}/stock/out`, payload);
}

export interface RegisterStockAdjustmentPayload {
  quantity: number;
  reason: string;
  movementDate?: string | undefined;
  notes?: string | undefined;
}

export function registerStockAdjustment(id: string, payload: RegisterStockAdjustmentPayload) {
  return api.post<PartEntity>(`/parts/${id}/stock/adjustment`, payload);
}

export interface FindPartMovementsQuery extends PaginationParams {
  type?: PartStockMovementType | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export function getPartMovements(id: string, query: FindPartMovementsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<PartStockMovementEntity>>(`/parts/${id}/movements`, query, signal);
}
