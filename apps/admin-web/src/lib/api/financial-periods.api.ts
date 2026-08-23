import type { Paginated, PaginationParams } from '../../types/api';
import type { FinancialPeriodEntity } from '../../types/entities';
import type { FinancialPeriodStatus } from '../../types/enums';
import { api } from './http';

export interface FindFinancialPeriodsQuery extends PaginationParams {
  year?: number | undefined;
  status?: FinancialPeriodStatus | undefined;
}

// GET /finance/periods (Fase 76) -- lista de periodos financeiros,
// ordenada por year/month DESC.
export function listFinancialPeriods(query: FindFinancialPeriodsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<FinancialPeriodEntity>>('/finance/periods', query, signal);
}

export function getFinancialPeriod(id: string) {
  return api.get<FinancialPeriodEntity>(`/finance/periods/${id}`);
}

export interface CreateFinancialPeriodPayload {
  year: number;
  month: number;
}

export function createFinancialPeriod(payload: CreateFinancialPeriodPayload) {
  return api.post<FinancialPeriodEntity>('/finance/periods', payload);
}

export function closeFinancialPeriod(id: string) {
  return api.post<FinancialPeriodEntity>(`/finance/periods/${id}/close`, {});
}
