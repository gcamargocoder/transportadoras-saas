import type {
  AuditLogEntity,
  PipelineBoardEntity,
  PipelineDashboardEntity,
  PipelineOpportunityEntity,
  PipelineStageEntity,
} from '../../types/entities';
import type { Paginated, PaginationParams } from '../../types/api';
import { api } from './http';

// Fase 96 -- Pipeline Comercial. Nunca calcula precificacao nem cria dado
// financeiro: estimatedValue e um numero descritivo, herdado de
// Proposal/Quotation pelo backend quando vinculada.

// --- Estagios (configuraveis por tenant) ---
export function listPipelineStages(includeInactive = false) {
  return api.get<PipelineStageEntity[]>('/pipeline/stages', includeInactive ? { includeInactive } : undefined);
}

export interface CreatePipelineStagePayload {
  name: string;
  order?: number | undefined;
  isWon?: boolean | undefined;
  isLost?: boolean | undefined;
}

export function createPipelineStage(payload: CreatePipelineStagePayload) {
  return api.post<PipelineStageEntity>('/pipeline/stages', payload);
}

export interface UpdatePipelineStagePayload extends Partial<CreatePipelineStagePayload> {
  isActive?: boolean | undefined;
}

export function updatePipelineStage(id: string, payload: UpdatePipelineStagePayload) {
  return api.patch<PipelineStageEntity>(`/pipeline/stages/${id}`, payload);
}

// --- Oportunidades ---
export interface FindPipelineOpportunitiesQuery extends PaginationParams {
  customerId?: string | undefined;
  stageId?: string | undefined;
  search?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  sortBy?: 'createdAt' | 'updatedAt' | 'estimatedValue' | 'stage' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export function listPipelineOpportunities(query: FindPipelineOpportunitiesQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<PipelineOpportunityEntity>>('/pipeline/opportunities', query, signal);
}

export function getPipelineOpportunity(id: string) {
  return api.get<PipelineOpportunityEntity>(`/pipeline/opportunities/${id}`);
}

export function getPipelineOpportunityHistory(id: string, query: PaginationParams = {}) {
  return api.get<Paginated<AuditLogEntity>>(`/pipeline/opportunities/${id}/history`, query);
}

export interface CreatePipelineOpportunityPayload {
  customerId: string;
  quotationId?: string | undefined;
  proposalId?: string | undefined;
  stageId?: string | undefined;
  title?: string | undefined;
  estimatedValue?: number | undefined;
  notes?: string | undefined;
}

export function createPipelineOpportunity(payload: CreatePipelineOpportunityPayload) {
  return api.post<PipelineOpportunityEntity>('/pipeline/opportunities', payload);
}

export type UpdatePipelineOpportunityPayload = Partial<Omit<CreatePipelineOpportunityPayload, 'stageId'>>;

export function updatePipelineOpportunity(id: string, payload: UpdatePipelineOpportunityPayload) {
  return api.patch<PipelineOpportunityEntity>(`/pipeline/opportunities/${id}`, payload);
}

export function updatePipelineOpportunityStage(id: string, stageId: string, reason?: string) {
  return api.patch<PipelineOpportunityEntity>(`/pipeline/opportunities/${id}/stage`, { stageId, reason });
}

// --- Board (Kanban) e Dashboard ---
export function getPipelineBoard() {
  return api.get<PipelineBoardEntity>('/pipeline/board');
}

export function getPipelineDashboard() {
  return api.get<PipelineDashboardEntity>('/pipeline/dashboard');
}
