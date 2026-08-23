import type { Paginated, PaginationParams } from '../../types/api';
import type { AuditLogEntity, FiscalDashboardEntity, FiscalDocumentEntity, TripDocumentStatusEntity } from '../../types/entities';
import type { FiscalDocumentStatus, FiscalDocumentType } from '../../types/enums';
import { api, apiFetchBlob } from './http';

export interface FindFiscalDocumentsQuery extends PaginationParams {
  documentType?: FiscalDocumentType | undefined;
  status?: FiscalDocumentStatus | undefined;
  issueDateFrom?: string | undefined;
  issueDateTo?: string | undefined;
  documentNumber?: string | undefined;
  accessKey?: string | undefined;
  tripId?: string | undefined;
  vehicleId?: string | undefined;
  driverId?: string | undefined;
  customerId?: string | undefined;
  unlinkedOnly?: boolean | undefined;
}

export function listFiscalDocuments(query: FindFiscalDocumentsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<FiscalDocumentEntity>>('/fiscal/documents', query, signal);
}

export function getFiscalDocument(id: string) {
  return api.get<FiscalDocumentEntity>(`/fiscal/documents/${id}`);
}

// Fase 53 -- aceita os mesmos filtros de listFiscalDocuments, para que o
// dashboard respeite exatamente o mesmo escopo/tenant/filtros da tabela.
export function getFiscalDashboard(query: FindFiscalDocumentsQuery = {}, signal?: AbortSignal) {
  return api.get<FiscalDashboardEntity>('/fiscal/documents/dashboard', query, signal);
}

export function getTripDocumentStatus(tripId: string, signal?: AbortSignal) {
  return api.get<TripDocumentStatusEntity>(`/fiscal/documents/trip/${tripId}/status`, undefined, signal);
}

export function getFiscalDocumentHistory(id: string, query: PaginationParams = {}) {
  return api.get<Paginated<AuditLogEntity>>(`/fiscal/documents/${id}/history`, query);
}

// Fase 68 -- preview/download do arquivo original (ex: comprovante de
// entrega). Retorna o Blob puro; mimeType/fileName para exibir/salvar
// devem vir da propria FiscalDocumentEntity ja carregada pelo chamador.
export function getFiscalDocumentFile(id: string): Promise<Blob> {
  return apiFetchBlob(`/fiscal/documents/${id}/file`);
}

export interface UploadFiscalDocumentFields {
  documentType: FiscalDocumentType;
  documentNumber?: string | undefined;
  accessKey?: string | undefined;
  series?: string | undefined;
  issueDate?: string | undefined;
  senderName?: string | undefined;
  senderDocument?: string | undefined;
  recipientName?: string | undefined;
  recipientDocument?: string | undefined;
  tripId?: string | undefined;
  vehicleId?: string | undefined;
  driverId?: string | undefined;
  customerId?: string | undefined;
}

function appendFields<T extends object>(form: FormData, fields: T): void {
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string' && value) form.append(key, value);
  }
}

// Upload direto (PDF/XML/JPG/JPEG/PNG) -- sem parser, metadados sempre
// informados manualmente pelo usuario.
export function uploadFiscalDocument(file: File, fields: UploadFiscalDocumentFields): Promise<FiscalDocumentEntity> {
  const form = new FormData();
  form.append('file', file);
  appendFields(form, fields);
  return api.post<FiscalDocumentEntity>('/fiscal/documents/upload', form, { isForm: true });
}

export interface ImportFiscalXmlFields {
  tripId?: string | undefined;
  vehicleId?: string | undefined;
  driverId?: string | undefined;
  customerId?: string | undefined;
}

// Importa um XML fiscal (NF-e/CT-e/MDF-e) -- metadados extraidos pelo
// parser do backend, nunca informados aqui.
export function importFiscalXml(file: File, fields: ImportFiscalXmlFields = {}): Promise<FiscalDocumentEntity> {
  const form = new FormData();
  form.append('file', file);
  appendFields(form, fields);
  return api.post<FiscalDocumentEntity>('/fiscal/documents/import', form, { isForm: true });
}

export interface UpdateFiscalDocumentPayload {
  status?: FiscalDocumentStatus | undefined;
  documentNumber?: string | undefined;
  series?: string | undefined;
  issueDate?: string | undefined;
  senderName?: string | undefined;
  senderDocument?: string | undefined;
  recipientName?: string | undefined;
  recipientDocument?: string | undefined;
  tripId?: string | null | undefined;
  vehicleId?: string | null | undefined;
  driverId?: string | null | undefined;
  customerId?: string | null | undefined;
}

export function updateFiscalDocument(id: string, payload: UpdateFiscalDocumentPayload) {
  return api.patch<FiscalDocumentEntity>(`/fiscal/documents/${id}`, payload);
}

export function deleteFiscalDocument(id: string) {
  return api.delete<void>(`/fiscal/documents/${id}`);
}
