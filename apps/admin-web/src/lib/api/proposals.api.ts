import type { AuditLogEntity, ProposalEntity } from '../../types/entities';
import type { ProposalStatus } from '../../types/enums';
import type { Paginated, PaginationParams } from '../../types/api';
import { api } from './http';

// Fase 95 -- Propostas. Nunca calcula nada no frontend: totalAmount/
// commercialConditions sao herdados do snapshot ja calculado da Quotation
// pelo backend quando quotationId e informado, ou enviados diretamente.
export interface FindProposalsQuery extends PaginationParams {
  customerId?: string | undefined;
  quotationId?: string | undefined;
  status?: ProposalStatus | undefined;
  search?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export function listProposals(query: FindProposalsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<ProposalEntity>>('/proposals', query, signal);
}

export function getProposal(id: string) {
  return api.get<ProposalEntity>(`/proposals/${id}`);
}

export function getProposalHistory(id: string, query: PaginationParams = {}) {
  return api.get<Paginated<AuditLogEntity>>(`/proposals/${id}/history`, query);
}

export interface CreateProposalPayload {
  customerId: string;
  quotationId?: string | undefined;
  totalAmount?: number | undefined;
  commercialConditions?: string | undefined;
  notes?: string | undefined;
  validUntil: string;
}

export function createProposal(payload: CreateProposalPayload) {
  return api.post<ProposalEntity>('/proposals', payload);
}

export type UpdateProposalPayload = Partial<CreateProposalPayload>;

export function updateProposal(id: string, payload: UpdateProposalPayload) {
  return api.patch<ProposalEntity>(`/proposals/${id}`, payload);
}

export function updateProposalStatus(id: string, status: ProposalStatus) {
  return api.patch<ProposalEntity>(`/proposals/${id}/status`, { status });
}
