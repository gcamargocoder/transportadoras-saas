import type { Paginated, PaginationParams } from '../../types/api';
import type { DriverDocumentEntity, DriverEntity } from '../../types/entities';
import type { DocumentType } from '../../types/enums';
import { api } from './http';

export interface FindDriversQuery extends PaginationParams {
  search?: string | undefined;
  isActive?: boolean | undefined;
  cpf?: string | undefined;
  cnhCategory?: string | undefined;
  cnhExpiringInDays?: number | undefined;
  sortBy?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface CreateDriverPayload {
  name: string;
  cpf: string;
  rg?: string | undefined;
  cnhNumber: string;
  cnhCategory: string;
  cnhExpiresAt: string;
  birthDate?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  address?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  zipCode?: string | undefined;
  notes?: string | undefined;
  admissionDate?: string | undefined;
}

export type UpdateDriverPayload = Partial<CreateDriverPayload>;

export function listDrivers(query: FindDriversQuery, signal?: AbortSignal) {
  return api.get<Paginated<DriverEntity>>('/drivers', query, signal);
}

export function getDriver(id: string) {
  return api.get<DriverEntity>(`/drivers/${id}`);
}

export function createDriver(payload: CreateDriverPayload) {
  return api.post<DriverEntity>('/drivers', payload);
}

export function updateDriver(id: string, payload: UpdateDriverPayload) {
  return api.patch<DriverEntity>(`/drivers/${id}`, payload);
}

export function updateDriverStatus(id: string, isActive: boolean) {
  return api.patch<DriverEntity>(`/drivers/${id}/status`, { isActive });
}

export function deleteDriver(id: string) {
  return api.delete<void>(`/drivers/${id}`);
}

export function getDriverDocuments(id: string) {
  return api.get<DriverDocumentEntity[]>(`/drivers/${id}/documents`);
}

export interface CreateDriverDocumentPayload {
  type: DocumentType;
  number?: string | undefined;
  issuedAt?: string | undefined;
  expiresAt?: string | undefined;
}

export function createDriverDocument(driverId: string, payload: CreateDriverDocumentPayload) {
  return api.post<DriverDocumentEntity>(`/drivers/${driverId}/documents`, payload);
}
