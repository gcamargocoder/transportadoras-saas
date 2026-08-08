import type { Paginated, PaginationParams } from '../../types/api';
import type { TollReconciliationDashboardEntity, TollRouteEntity } from '../../types/entities';
import { api } from './http';

export interface FindTollRoutesQuery extends PaginationParams {
  search?: string | undefined;
  isActive?: boolean | undefined;
  sortBy?: 'name' | 'createdAt' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface CreateTollRoutePayload {
  name: string;
  originLabel: string;
  destinationLabel: string;
}

export type UpdateTollRoutePayload = Partial<CreateTollRoutePayload>;

export function listTollRoutes(query: FindTollRoutesQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<TollRouteEntity>>('/toll-routes', query, signal);
}

export function getTollRoute(id: string) {
  return api.get<TollRouteEntity>(`/toll-routes/${id}`);
}

export function createTollRoute(payload: CreateTollRoutePayload) {
  return api.post<TollRouteEntity>('/toll-routes', payload);
}

export function updateTollRoute(id: string, payload: UpdateTollRoutePayload) {
  return api.patch<TollRouteEntity>(`/toll-routes/${id}`, payload);
}

export function updateTollRouteStatus(id: string, isActive: boolean) {
  return api.patch<TollRouteEntity>(`/toll-routes/${id}/status`, { isActive });
}

// Substitui a lista INTEIRA de paradas, na ordem do array enviado (indice 0
// = 1a praca) -- usado tanto para adicionar/remover quanto para reordenar.
export function replaceTollRouteStops(id: string, tollPlazaIds: string[]) {
  return api.put<TollRouteEntity>(`/toll-routes/${id}/stops`, {
    stops: tollPlazaIds.map((tollPlazaId) => ({ tollPlazaId })),
  });
}

export function deleteTollRoute(id: string) {
  return api.delete<void>(`/toll-routes/${id}`);
}

// Conciliacao agregada de todas as viagens do tenant com rota vinculada.
export function getTollReconciliationDashboard(signal?: AbortSignal) {
  return api.get<TollReconciliationDashboardEntity>('/toll-routes/dashboard', undefined, signal);
}
