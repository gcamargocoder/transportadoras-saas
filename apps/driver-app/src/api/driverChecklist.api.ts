import { apiRequest, apiUpload, UploadFilePart } from './http';
import {
  ChecklistAnswerInput,
  ChecklistAnswersSubmitResult,
  ChecklistEvidence,
  ChecklistExecution,
  ChecklistTemplate,
  CreateChecklistExecutionInput,
  UploadChecklistEvidenceInput,
} from './driverChecklist.types';

// Fase 111 -- tripId opcional: quando informado, o backend filtra os
// templates pelo tipo de veiculo/carreta da composicao daquela viagem
// (ChecklistTemplate.vehicleType/trailerType, ja existentes desde a Fase 38
// mas nunca usados para filtrar ate agora). Sem tripId, comportamento
// identico ao anterior (todos os templates PUBLISHED do tenant).
export function getAvailableChecklists(tripId?: string): Promise<ChecklistTemplate[]> {
  return apiRequest<ChecklistTemplate[]>('/driver/checklists/available', tripId ? { query: { tripId } } : undefined);
}

export function createChecklist(input: CreateChecklistExecutionInput): Promise<ChecklistExecution> {
  return apiRequest<ChecklistExecution>('/driver/checklists', { method: 'POST', body: input });
}

export function getChecklist(executionId: string): Promise<ChecklistExecution> {
  return apiRequest<ChecklistExecution>(`/driver/checklists/${executionId}`);
}

export function submitChecklistAnswers(
  executionId: string,
  answers: ChecklistAnswerInput[],
): Promise<ChecklistAnswersSubmitResult> {
  return apiRequest<ChecklistAnswersSubmitResult>(`/driver/checklists/${executionId}/answers`, {
    method: 'POST',
    body: { answers },
  });
}

export function completeChecklist(executionId: string): Promise<ChecklistExecution> {
  return apiRequest<ChecklistExecution>(`/driver/checklists/${executionId}/complete`, { method: 'POST' });
}

// Fase 39 -- upload de evidencia (foto/assinatura). `file` e o path local
// persistido (ver storage/evidenceFiles.ts) -- nunca a URI efemera da
// camera direto.
export function uploadChecklistEvidence(
  executionId: string,
  input: UploadChecklistEvidenceInput,
  file: UploadFilePart,
): Promise<ChecklistEvidence> {
  const fields: Record<string, string | undefined> = {
    deviceEventId: input.deviceEventId,
    type: input.type,
    itemId: input.itemId,
    answerId: input.answerId,
    description: input.description,
    latitude: input.latitude?.toString(),
    longitude: input.longitude?.toString(),
  };
  return apiUpload<ChecklistEvidence>(`/driver/checklists/${executionId}/evidence`, fields, file);
}
