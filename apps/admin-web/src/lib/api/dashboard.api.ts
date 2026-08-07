import type { QueryableParams } from '../../types/api';
import type { DashboardEntity } from '../../types/entities';
import { api } from './http';

export interface DashboardQuery extends QueryableParams {
  startDate?: string | undefined;
  endDate?: string | undefined;
  vehicleId?: string | undefined;
  driverId?: string | undefined;
  customerId?: string | undefined;
}

export function getDashboard(query: DashboardQuery = {}, signal?: AbortSignal) {
  return api.get<DashboardEntity>('/dashboard', query, signal);
}
