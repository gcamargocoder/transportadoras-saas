import type { Paginated, PaginationParams } from '../../types/api';
import type { MaintenanceProviderEntity, MaintenanceProviderSummaryEntity } from '../../types/entities';
import type { MaintenanceProviderType } from '../../types/enums';
import { api } from './http';

export interface FindMaintenanceProvidersQuery extends PaginationParams {
  type?: MaintenanceProviderType | undefined;
  search?: string | undefined;
  isActive?: boolean | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface CreateMaintenanceProviderPayload {
  type: MaintenanceProviderType;
  name: string;
  tradeName?: string | undefined;
  document?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  address?: string | undefined;
  contactName?: string | undefined;
  specialties?: string | undefined;
  notes?: string | undefined;
}

export type UpdateMaintenanceProviderPayload = Partial<Omit<CreateMaintenanceProviderPayload, 'type'>>;

export function listMaintenanceProviders(query: FindMaintenanceProvidersQuery, signal?: AbortSignal) {
  return api.get<Paginated<MaintenanceProviderEntity>>('/maintenance-providers', query, signal);
}

export function getMaintenanceProvider(id: string) {
  return api.get<MaintenanceProviderEntity>(`/maintenance-providers/${id}`);
}

export function getMaintenanceProviderSummary(id: string) {
  return api.get<MaintenanceProviderSummaryEntity>(`/maintenance-providers/${id}/summary`);
}

export function createMaintenanceProvider(payload: CreateMaintenanceProviderPayload) {
  return api.post<MaintenanceProviderEntity>('/maintenance-providers', payload);
}

export function updateMaintenanceProvider(id: string, payload: UpdateMaintenanceProviderPayload) {
  return api.patch<MaintenanceProviderEntity>(`/maintenance-providers/${id}`, payload);
}

export function updateMaintenanceProviderStatus(id: string, isActive: boolean) {
  return api.patch<MaintenanceProviderEntity>(`/maintenance-providers/${id}/status`, { isActive });
}

export function deleteMaintenanceProvider(id: string) {
  return api.delete<void>(`/maintenance-providers/${id}`);
}
