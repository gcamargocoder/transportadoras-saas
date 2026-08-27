import type { CustomerProfitabilityDashboardEntity, CustomerProfitabilityEntity } from '../../types/entities';
import type { Paginated, PaginationParams, QueryableParams } from '../../types/api';
import { api } from './http';

// Fase 97 -- Rentabilidade por Cliente. Modulo SOMENTE LEITURA: consolida
// TripRevenue/TripExpense/FuelSupply/TollTransaction ja existentes, nunca
// calcula nada novo no frontend.
export interface FindCustomerProfitabilityDashboardQuery extends QueryableParams {
  from?: string | undefined;
  to?: string | undefined;
}

export function getCustomerProfitabilityDashboard(query: FindCustomerProfitabilityDashboardQuery = {}) {
  return api.get<CustomerProfitabilityDashboardEntity>('/customer-profitability/dashboard', query);
}

export interface FindCustomerProfitabilityQuery extends PaginationParams {
  customerId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  sortBy?: 'result' | 'margin' | 'revenue' | 'cost' | 'trips' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export function listCustomerProfitability(query: FindCustomerProfitabilityQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<CustomerProfitabilityEntity>>('/customer-profitability/customers', query, signal);
}

export function getCustomerProfitabilityForCustomer(
  customerId: string,
  query: FindCustomerProfitabilityDashboardQuery = {},
) {
  return api.get<CustomerProfitabilityEntity>(`/customer-profitability/customers/${customerId}`, query);
}
