import type { Paginated, PaginationParams } from '../../types/api';
import type { TenantEntity, TenantSettingsEntity, UserEntity } from '../../types/entities';
import type { UserRole } from '../../types/enums';
import { api } from './http';

// --- Usuários internos do tenant ---
export interface FindUsersQuery extends PaginationParams {
  search?: string | undefined;
  role?: UserRole | undefined;
  isActive?: boolean | undefined;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export function listUsers(query: FindUsersQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<UserEntity>>('/users', query, signal);
}

export function createUser(payload: CreateUserPayload) {
  return api.post<UserEntity>('/users', payload);
}

export interface UpdateUserPayload {
  name?: string | undefined;
  email?: string | undefined;
  role?: UserRole | undefined;
}

export function updateUser(id: string, payload: UpdateUserPayload) {
  return api.patch<UserEntity>(`/users/${id}`, payload);
}

export function updateUserStatus(id: string, isActive: boolean) {
  return api.patch<UserEntity>(`/users/${id}/status`, { isActive });
}

export function deleteUser(id: string) {
  return api.delete<void>(`/users/${id}`);
}

// --- Empresa (tenant atual) ---
export function getMyTenant() {
  return api.get<TenantEntity>('/tenants/me');
}

export interface UpdateTenantPayload {
  name?: string | undefined;
  tradeName?: string | undefined;
  logoUrl?: string | undefined;
}

export function updateMyTenant(payload: UpdateTenantPayload) {
  return api.patch<TenantEntity>('/tenants/me', payload);
}

// Fase 44 -- reaproveita o recurso ja existente GET/PATCH /tenant-settings
// (Fase 8), so consumido aqui para ler/gravar
// preferences.stopDurationThresholdsMinutes (limites de duracao de parada
// por tipo). Nenhum endpoint novo -- PATCH sempre substitui `preferences`
// por inteiro (comportamento ja existente do backend), entao o chamador
// deve mesclar com o valor atual antes de enviar.
export function getTenantSettings() {
  return api.get<TenantSettingsEntity>('/tenant-settings');
}

export function updateTenantSettings(payload: { preferences: Record<string, unknown> }) {
  return api.patch<TenantSettingsEntity>('/tenant-settings', payload);
}
