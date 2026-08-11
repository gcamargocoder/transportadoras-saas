// Fase 38 -- espelha so os campos/enums do backend que o app do motorista
// realmente vai consumir (ver docs/checklist-module.md). Sem tela nesta fase
// -- so os contratos, para nao travar a implementacao visual futura.
export type ChecklistType = 'PRE_TRIP' | 'POST_TRIP' | 'MAINTENANCE' | 'TRAILER' | 'SAFETY' | 'ACCIDENT' | 'AUDIT';

// So BOOLEAN e funcionalmente validado ponta a ponta nesta fase.
export type ChecklistItemType = 'BOOLEAN' | 'TEXT' | 'NUMBER' | 'PHOTO' | 'SIGNATURE' | 'ODOMETER' | 'SELECT';

export type ChecklistExecutionStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

// Fase 39 -- tipos aceitos hoje por UploadChecklistEvidenceDto no backend.
export type ChecklistEvidenceType = 'ODOMETER' | 'AXLE_1' | 'AXLE_2' | 'AXLE_3' | 'GENERAL' | 'DAMAGE' | 'SIGNATURE';

export interface ChecklistItem {
  id: string;
  code: string;
  label: string;
  description: string | null;
  type: ChecklistItemType;
  required: boolean;
  order: number;
  critical: boolean;
  requiresObservation: boolean;
  requiresPhoto: boolean;
}

export interface ChecklistSection {
  id: string;
  title: string;
  order: number;
  items: ChecklistItem[];
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  type: ChecklistType;
  version: number;
  sections: ChecklistSection[];
}

export interface ChecklistAnswerInput {
  itemId: string;
  booleanValue?: boolean | undefined;
  textValue?: string | undefined;
  numberValue?: number | undefined;
  selectedValue?: string | undefined;
}

export interface ChecklistAnswersSubmitResult {
  created: number;
  updated: number;
}

export interface ChecklistEvidence {
  id: string;
  itemId: string | null;
  answerId: string | null;
  type: ChecklistEvidenceType;
  capturedAt: string;
}

export interface ChecklistAnswer {
  id: string;
  itemId: string;
  booleanValue: boolean | null;
  textValue: string | null;
  numberValue: number | null;
  selectedValue: string | null;
  evidence: ChecklistEvidence[];
}

export interface ChecklistExecution {
  id: string;
  templateId: string;
  templateVersion: number;
  tripId: string | null;
  status: ChecklistExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  odometerKm: number | null;
  hasCriticalNonConformity: boolean;
  answers: ChecklistAnswer[];
  evidence: ChecklistEvidence[];
}

// deviceEventId gerado no dispositivo -- garante idempotencia (mesmo padrao
// de TrackingPointInput/fuel-supply, ver syncQueue.ts).
export interface CreateChecklistExecutionInput {
  deviceEventId: string;
  templateId: string;
  tripId?: string;
  vehicleId?: string;
  trailerId?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  odometerKm?: number;
  inspectionLocation?: string;
  responsibleName?: string;
}

// Fase 39 -- campos que acompanham o upload multipart (o arquivo em si vai
// separado, ver UploadFilePart em ./http). deviceEventId aqui garante que
// reenviar a mesma foto (retry apos falha) nunca cria uma evidencia
// duplicada -- mesmo mecanismo de idempotencia do resto do app.
export interface UploadChecklistEvidenceInput {
  deviceEventId: string;
  type: ChecklistEvidenceType;
  itemId?: string;
  answerId?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
}
