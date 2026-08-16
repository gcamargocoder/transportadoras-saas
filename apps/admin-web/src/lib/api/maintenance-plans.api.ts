import type { Paginated, PaginationParams } from '../../types/api';
import type { MaintenancePlanEntity } from '../../types/entities';
import type { MaintenanceComponent, VehicleMaintenanceType } from '../../types/enums';
import { api } from './http';

// Fase 45 -- planos de manutencao preventiva (GET/POST/PATCH/DELETE
// /maintenance/plans, modulo novo -- distinto de /maintenances, que
// continua sendo os registros/ordens de manutencao ja existentes).
export interface FindMaintenancePlansQuery extends PaginationParams {
  vehicleId?: string | undefined;
  component?: MaintenanceComponent | undefined;
  active?: boolean | undefined;
}

export interface MaintenancePlanPayload {
  vehicleId: string;
  name: string;
  component: MaintenanceComponent;
  maintenanceType?: VehicleMaintenanceType | undefined;
  intervalKm?: number | undefined;
  intervalDays?: number | undefined;
  intervalHours?: number | undefined;
  alertBeforeKm?: number | undefined;
  alertBeforeDays?: number | undefined;
  active?: boolean | undefined;
}

export function listMaintenancePlans(query: FindMaintenancePlansQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<MaintenancePlanEntity>>('/maintenance/plans', query, signal);
}

export function createMaintenancePlan(payload: MaintenancePlanPayload) {
  return api.post<MaintenancePlanEntity>('/maintenance/plans', payload);
}

export function updateMaintenancePlan(id: string, payload: Partial<MaintenancePlanPayload>) {
  return api.patch<MaintenancePlanEntity>(`/maintenance/plans/${id}`, payload);
}

export function deleteMaintenancePlan(id: string) {
  return api.delete<void>(`/maintenance/plans/${id}`);
}
