import type { Paginated, PaginationParams } from '../../types/api';
import type {
  ContractRenewalEntity,
  ContractRenewalSummaryEntity,
  RenewalExpiringContractEntity,
} from '../../types/entities';
import type { ContractRenewalStatus } from '../../types/enums';
import { api } from './http';

// Fase 98 -- Renovacao de Contratos. Reaproveita o Contract existente (ver
// freight.api.ts) -- este modulo so cobre o PROCESSO de renovacao.

export interface FindContractRenewalsQuery extends PaginationParams {
  contractId?: string | undefined;
  customerId?: string | undefined;
  status?: ContractRenewalStatus | undefined;
}

export function listContractRenewals(query: FindContractRenewalsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<ContractRenewalEntity>>('/contract-renewals', query, signal);
}

export function getContractRenewal(id: string) {
  return api.get<ContractRenewalEntity>(`/contract-renewals/${id}`);
}

export interface FindExpiringContractsQuery extends PaginationParams {
  customerId?: string | undefined;
  withinDays?: number | undefined;
}

export function listExpiringContracts(query: FindExpiringContractsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<RenewalExpiringContractEntity>>('/contract-renewals/expiring-contracts', query, signal);
}

export function getContractRenewalSummary(query: { customerId?: string | undefined } = {}) {
  return api.get<ContractRenewalSummaryEntity>('/contract-renewals/summary', query);
}

export interface InitiateContractRenewalPayload {
  contractId: string;
  notes?: string | undefined;
}

export function initiateContractRenewal(payload: InitiateContractRenewalPayload) {
  return api.post<ContractRenewalEntity>('/contract-renewals', payload);
}

export interface CompleteContractRenewalPayload {
  code: string;
  startDate: string;
  endDate?: string | undefined;
  description?: string | undefined;
  commercialTerms?: string | undefined;
  notes?: string | undefined;
}

export function completeContractRenewal(id: string, payload: CompleteContractRenewalPayload) {
  return api.post<ContractRenewalEntity>(`/contract-renewals/${id}/complete`, payload);
}

export function cancelContractRenewal(id: string) {
  return api.post<ContractRenewalEntity>(`/contract-renewals/${id}/cancel`, {});
}
