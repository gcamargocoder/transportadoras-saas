import type { Paginated, PaginationParams } from '../../types/api';
import type {
  AuditLogEntity,
  PlatformDashboardEntity,
  TenantEntity,
  TenantListItemEntity,
  TenantUsageEntity,
} from '../../types/entities';
import type { TenantModule, TenantPlanTier, TenantStatus } from '../../types/enums';
import { api } from './http';

// Fase 47 -- Super Administracao da Plataforma. Envolve os endpoints
// cross-tenant de GET/PATCH/DELETE /tenants (ja existentes, SUPER_ADMIN
// only) + os novos desta fase (dashboard/usage/history/status/plan). Nao
// existe nenhum cliente de API cross-tenant no frontend antes desta fase.

export interface FindTenantsQuery extends PaginationParams {
  search?: string | undefined;
  isActive?: boolean | undefined;
  status?: TenantStatus | undefined;
  sortBy?: 'name' | 'createdAt' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export function listTenants(query: FindTenantsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<TenantListItemEntity>>('/tenants', query, signal);
}

export function getTenant(id: string, signal?: AbortSignal) {
  return api.get<TenantEntity>(`/tenants/${id}`, undefined, signal);
}

export interface CreateTenantPayload {
  name: string;
  document: string;
  slug?: string | undefined;
  tradeName?: string | undefined;
  logoUrl?: string | undefined;
  admin: {
    name: string;
    email: string;
    password: string;
  };
}

// Mesmo endpoint publico (POST /tenants) usado pelo self-service signup --
// um SUPER_ADMIN autenticado usando esta tela chama exatamente a mesma
// rota, sem duplicar logica de criacao de tenant+admin.
export function createTenant(payload: CreateTenantPayload) {
  return api.post<TenantEntity>('/tenants', payload);
}

export interface UpdateTenantFullPayload {
  name?: string | undefined;
  tradeName?: string | undefined;
  document?: string | undefined;
  slug?: string | undefined;
  logoUrl?: string | undefined;
  isActive?: boolean | undefined;
}

export function updateTenant(id: string, payload: UpdateTenantFullPayload) {
  return api.patch<TenantEntity>(`/tenants/${id}`, payload);
}

export function deleteTenant(id: string) {
  return api.delete<void>(`/tenants/${id}`);
}

export function getPlatformDashboard(signal?: AbortSignal) {
  return api.get<PlatformDashboardEntity>('/tenants/dashboard', undefined, signal);
}

export function getTenantUsage(id: string, signal?: AbortSignal) {
  return api.get<TenantUsageEntity>(`/tenants/${id}/usage`, undefined, signal);
}

export function getTenantHistory(id: string, query: PaginationParams = {}, signal?: AbortSignal) {
  return api.get<Paginated<AuditLogEntity>>(`/tenants/${id}/history`, query, signal);
}

export function updateTenantStatus(id: string, status: TenantStatus) {
  return api.patch<TenantEntity>(`/tenants/${id}/status`, { status });
}

export interface UpdateTenantPlanPayload {
  tier?: TenantPlanTier | undefined;
  trialEndsAt?: string | undefined;
  maxUsers?: number | undefined;
  maxVehicles?: number | undefined;
  maxDrivers?: number | undefined;
  maxStorageMb?: number | undefined;
  enabledModules?: TenantModule[] | undefined;
}

export function updateTenantPlan(id: string, payload: UpdateTenantPlanPayload) {
  return api.patch<TenantEntity>(`/tenants/${id}/plan`, payload);
}
