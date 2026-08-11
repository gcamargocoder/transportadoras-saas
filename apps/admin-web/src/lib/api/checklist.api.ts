// Fase 38 -- checklist operacional. Endpoints administrativos
// (/checklists/templates, /checklists/executions). Sem tela nesta fase --
// so os contratos, para nao travar a evolucao futura (ver docs/checklist-module.md).
import type { Paginated, PaginationParams } from '../../types/api';
import type { ChecklistExecutionEntity, ChecklistTemplateEntity } from '../../types/entities';
import type { ChecklistExecutionStatus, ChecklistItemType, ChecklistTemplateStatus, ChecklistType } from '../../types/enums';
import { api } from './http';

export interface CreateChecklistItemPayload {
  code: string;
  label: string;
  description?: string | undefined;
  type: ChecklistItemType;
  required?: boolean | undefined;
  order: number;
  requiresObservation?: boolean | undefined;
  requiresPhoto?: boolean | undefined;
  critical?: boolean | undefined;
  options?: Record<string, unknown> | undefined;
}

export interface CreateChecklistSectionPayload {
  title: string;
  description?: string | undefined;
  order: number;
  items: CreateChecklistItemPayload[];
}

export interface CreateChecklistTemplatePayload {
  name: string;
  description?: string | undefined;
  type: ChecklistType;
  vehicleType?: string | undefined;
  trailerType?: string | undefined;
  sections: CreateChecklistSectionPayload[];
}

// PATCH exige o MESMO shape completo (substitui a arvore inteira) -- so
// aceito enquanto o template esta DRAFT, ver ChecklistTemplatesService.update.
export type UpdateChecklistTemplatePayload = CreateChecklistTemplatePayload;

export interface FindChecklistTemplatesQuery extends PaginationParams {
  type?: ChecklistType | undefined;
  status?: ChecklistTemplateStatus | undefined;
}

export interface FindChecklistExecutionsQuery extends PaginationParams {
  tripId?: string | undefined;
  vehicleId?: string | undefined;
  status?: ChecklistExecutionStatus | undefined;
}

export function listChecklistTemplates(query: FindChecklistTemplatesQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<ChecklistTemplateEntity>>('/checklists/templates', query, signal);
}

export function getChecklistTemplate(id: string) {
  return api.get<ChecklistTemplateEntity>(`/checklists/templates/${id}`);
}

export function createChecklistTemplate(payload: CreateChecklistTemplatePayload) {
  return api.post<ChecklistTemplateEntity>('/checklists/templates', payload);
}

export function updateChecklistTemplate(id: string, payload: UpdateChecklistTemplatePayload) {
  return api.patch<ChecklistTemplateEntity>(`/checklists/templates/${id}`, payload);
}

export function publishChecklistTemplate(id: string) {
  return api.post<ChecklistTemplateEntity>(`/checklists/templates/${id}/publish`);
}

export function createChecklistTemplateVersion(id: string) {
  return api.post<ChecklistTemplateEntity>(`/checklists/templates/${id}/versions`);
}

export function listChecklistExecutions(query: FindChecklistExecutionsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<ChecklistExecutionEntity>>('/checklists/executions', query, signal);
}

export function getChecklistExecution(id: string) {
  return api.get<ChecklistExecutionEntity>(`/checklists/executions/${id}`);
}
