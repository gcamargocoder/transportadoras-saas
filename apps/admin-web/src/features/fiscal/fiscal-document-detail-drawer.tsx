'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, ExternalLink, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Drawer } from '../../components/ui/drawer';
import { EntitySelect } from '../../components/ui/entity-select';
import { FormField } from '../../components/ui/form-field';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { listDrivers } from '../../lib/api/drivers.api';
import {
  deleteFiscalDocument,
  getFiscalDocument,
  getFiscalDocumentFile,
  getFiscalDocumentHistory,
  updateFiscalDocument,
} from '../../lib/api/fiscal.api';
import { listVehicles } from '../../lib/api/fleet.api';
import { listCustomers } from '../../lib/api/trips.api';
import {
  FISCAL_DOCUMENT_ORIGIN_LABELS,
  FISCAL_DOCUMENT_SOURCE_LABELS,
  FISCAL_DOCUMENT_STATUS_LABELS,
  FISCAL_DOCUMENT_STATUS_TONE,
  FISCAL_DOCUMENT_TYPE_LABELS,
  FISCAL_ISSUE_CODE_LABELS,
} from '../../lib/labels';
import type { FiscalDocumentEntity } from '../../types/entities';
import type { FiscalDocumentStatus } from '../../types/enums';
import { formatDate, formatDateTime } from '../../utils/format';

const AUDIT_ACTION_LABELS: Record<string, string> = {
  'fiscal.document_uploaded': 'Documento enviado',
  'fiscal.document_imported': 'XML importado',
  'fiscal.document_updated': 'Metadados atualizados',
  'fiscal.document_linked': 'Vínculo alterado',
  'fiscal.document_deleted': 'Documento removido',
  'fiscal.delivery_proof_submitted': 'Comprovante de entrega registrado (app do motorista)',
};

// Fase 68 -- mesmo criterio do backend (FiscalDocumentsService.getFile):
// imagem/PDF permitem preview inline; os demais formatos so download.
function isInlinePreviewable(mimeType: string | null): boolean {
  return mimeType !== null && (mimeType.startsWith('image/') || mimeType === 'application/pdf');
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FiscalDocumentDetailDrawer({
  document,
  onClose,
}: {
  document: FiscalDocumentEntity | null;
  onClose: () => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<FiscalDocumentStatus | ''>('');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [fileActionBusy, setFileActionBusy] = useState<'preview' | 'download' | null>(null);

  useEffect(() => {
    if (!document) return;
    setStatus(document.status);
    setVehicleId(document.vehicleId ?? '');
    setDriverId(document.driverId ?? '');
    setCustomerId(document.customerId ?? '');
  }, [document]);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!document) throw new Error('Nenhum documento selecionado.');
      return updateFiscalDocument(document.id, {
        status: status || undefined,
        vehicleId: vehicleId || null,
        driverId: driverId || null,
        customerId: customerId || null,
      });
    },
    onSuccess: () => {
      toast.success('Documento atualizado.', 'Status e vínculo salvos.');
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents'] });
      onClose();
    },
    onError: (error) => toast.error('Não foi possível atualizar o documento.', toFriendlyMessage(error)),
  });

  // Fase 55 -- relatedDocuments so vem calculado no detalhe (GET /:id), nunca
  // na listagem/dashboard (evita N+1 la) -- por isso busca sob demanda aqui,
  // mesmo padrao do historyQuery abaixo.
  const detailQuery = useQuery({
    queryKey: ['fiscal-documents', 'detail', document?.id],
    queryFn: () => getFiscalDocument(document!.id),
    enabled: document !== null,
  });

  const historyQuery = useQuery({
    queryKey: ['fiscal-documents', 'history', document?.id],
    queryFn: () => getFiscalDocumentHistory(document!.id, { pageSize: 10 }),
    enabled: document !== null,
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!document) throw new Error('Nenhum documento selecionado.');
      return deleteFiscalDocument(document.id);
    },
    onSuccess: () => {
      toast.success('Documento removido.');
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents'] });
      onClose();
    },
    onError: (error) => toast.error('Não foi possível remover o documento.', toFriendlyMessage(error)),
  });

  // Fase 68 -- preview/download do arquivo original (GET /fiscal/documents/:id/file).
  // mimeType/fileName vem da propria FiscalDocumentEntity, nunca do nome
  // digitado pelo usuario. O object URL e revogado logo depois de usado
  // (preview: quando a aba some do controle deste componente nao ha como
  // saber, entao revoga so apos um tempo curto; download: revoga apos o
  // clique sintetico).
  async function handlePreview(): Promise<void> {
    if (!document) return;
    setFileActionBusy('preview');
    try {
      const blob = await getFiscalDocumentFile(document.id);
      const typedBlob = document.mimeType ? new Blob([blob], { type: document.mimeType }) : blob;
      const url = URL.createObjectURL(typedBlob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast.error('Não foi possível abrir o arquivo.', toFriendlyMessage(error));
    } finally {
      setFileActionBusy(null);
    }
  }

  async function handleDownload(): Promise<void> {
    if (!document) return;
    setFileActionBusy('download');
    try {
      const blob = await getFiscalDocumentFile(document.id);
      const typedBlob = document.mimeType ? new Blob([blob], { type: document.mimeType }) : blob;
      const url = URL.createObjectURL(typedBlob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document.fileName ?? 'documento';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Não foi possível baixar o arquivo.', toFriendlyMessage(error));
    } finally {
      setFileActionBusy(null);
    }
  }

  return (
    <Drawer open={document !== null} onClose={onClose} title="Documento fiscal">
      {document && (
        <div className="flex flex-col gap-5 p-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">{FISCAL_DOCUMENT_TYPE_LABELS[document.documentType]}</p>
              <Badge tone={FISCAL_DOCUMENT_STATUS_TONE[document.status]}>{FISCAL_DOCUMENT_STATUS_LABELS[document.status]}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-ink-subtle">
              {FISCAL_DOCUMENT_SOURCE_LABELS[document.source]} · {FISCAL_DOCUMENT_ORIGIN_LABELS[document.origin]}
            </p>
          </div>

          <div className="rounded-md bg-surface-muted p-2.5">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Situação estrutural</p>
            {document.validationIssues.length === 0 ? (
              <Badge tone="success">Nenhuma inconsistência estrutural identificada</Badge>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {document.validationIssues.map((issue) => (
                  <Badge key={issue} tone="danger">
                    {FISCAL_ISSUE_CODE_LABELS[issue]}
                  </Badge>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-[11px] text-ink-subtle">
              Validação apenas estrutural (formato, chave, campos e vínculo) — nunca autorização/autenticidade perante a SEFAZ.
            </p>
          </div>

          {detailQuery.data && detailQuery.data.relatedDocumentsAvailable && (
            <div className="rounded-md bg-surface-muted p-2.5">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Documentos relacionados</p>
              {detailQuery.data.relatedDocuments.length === 0 ? (
                <p className="text-xs text-ink-subtle">Nenhum documento relacionado identificado.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {detailQuery.data.relatedDocuments.map((related) => (
                    <li key={related.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-ink">
                        {FISCAL_DOCUMENT_TYPE_LABELS[related.documentType]} · {related.documentNumber ?? related.fileName ?? related.id.slice(0, 8)}
                      </span>
                      <Badge tone={FISCAL_DOCUMENT_STATUS_TONE[related.status]}>{FISCAL_DOCUMENT_STATUS_LABELS[related.status]}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1.5 text-[11px] text-ink-subtle">Relação derivada das chaves manifestadas no XML — nunca inferida.</p>
            </div>
          )}

          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Número</dt>
              <dd className="text-ink">{document.documentNumber ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Série</dt>
              <dd className="text-ink">{document.series ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-ink-muted">Chave de acesso</dt>
              <dd className="break-all text-right text-ink">{document.accessKey ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Emissão</dt>
              <dd className="text-ink">{document.issueDate ? formatDate(document.issueDate) : '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Emitente</dt>
              <dd className="text-right text-ink">{document.senderName ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Destinatário</dt>
              <dd className="text-right text-ink">{document.recipientName ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Arquivo</dt>
              <dd className="text-right text-ink">
                {document.fileName ?? '—'} ({formatBytes(document.sizeBytes)})
              </dd>
            </div>
            {document.attachmentId && (
              <div className="flex justify-end gap-2">
                {isInlinePreviewable(document.mimeType) && (
                  <Button variant="outline" size="sm" onClick={handlePreview} loading={fileActionBusy === 'preview'}>
                    <Eye size={14} />
                    Visualizar
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleDownload} loading={fileActionBusy === 'download'}>
                  <Download size={14} />
                  Baixar
                </Button>
              </div>
            )}
            {document.tripLabel && document.tripId && (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Viagem</dt>
                <dd className="text-right text-ink">
                  <Link href={`/trips/${document.tripId}`} className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                    {document.tripLabel}
                    <ExternalLink size={12} />
                  </Link>
                </dd>
              </div>
            )}
          </dl>

          {document.metadata && Object.keys(document.metadata).length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Metadados extraídos do XML</p>
              <dl className="flex flex-col gap-1 rounded-md bg-surface-muted p-2.5 text-xs">
                {Object.entries(document.metadata).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3">
                    <dt className="text-ink-subtle">{key}</dt>
                    <dd className="text-ink">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Status e vínculo</p>
            <FormField label="Status" htmlFor="fiscal-detail-status">
              <Select id="fiscal-detail-status" value={status} onChange={(e) => setStatus(e.target.value as FiscalDocumentStatus)}>
                {(Object.keys(FISCAL_DOCUMENT_STATUS_LABELS) as FiscalDocumentStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {FISCAL_DOCUMENT_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Veículo" htmlFor="fiscal-detail-vehicle">
              <EntitySelect
                id="fiscal-detail-vehicle"
                queryKey={['vehicles', 'select']}
                queryFn={() => listVehicles({ pageSize: 100 })}
                getOptionValue={(v) => v.id}
                getOptionLabel={(v) => v.plate}
                value={vehicleId}
                onChange={setVehicleId}
                placeholder="Nenhum"
              />
            </FormField>
            <FormField label="Motorista" htmlFor="fiscal-detail-driver">
              <EntitySelect
                id="fiscal-detail-driver"
                queryKey={['drivers', 'select']}
                queryFn={() => listDrivers({ pageSize: 100 })}
                getOptionValue={(d) => d.id}
                getOptionLabel={(d) => d.name}
                value={driverId}
                onChange={setDriverId}
                placeholder="Nenhum"
              />
            </FormField>
            <FormField label="Cliente" htmlFor="fiscal-detail-customer">
              <EntitySelect
                id="fiscal-detail-customer"
                queryKey={['customers', 'select']}
                queryFn={() => listCustomers({ pageSize: 100 })}
                getOptionValue={(c) => c.id}
                getOptionLabel={(c) => c.name}
                value={customerId}
                onChange={setCustomerId}
                placeholder="Nenhum"
              />
            </FormField>
            <Button onClick={() => updateMutation.mutate()} loading={updateMutation.isPending}>
              Salvar
            </Button>
          </div>

          <div className="border-t border-border pt-4">
            <Button variant="danger" onClick={() => deleteMutation.mutate()} loading={deleteMutation.isPending}>
              <Trash2 size={14} />
              Remover documento
            </Button>
          </div>

          <p className="text-xs text-ink-subtle">
            Criado por {document.creatorName ?? '—'} em {formatDateTime(document.createdAt)}
            {document.updaterName && <> · Atualizado por {document.updaterName} em {formatDateTime(document.updatedAt)}</>}
          </p>

          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Histórico</p>
            {historyQuery.isLoading && <p className="text-xs text-ink-subtle">Carregando...</p>}
            {historyQuery.data && historyQuery.data.items.length === 0 && (
              <p className="text-xs text-ink-subtle">Nenhum evento registrado.</p>
            )}
            {historyQuery.data && historyQuery.data.items.length > 0 && (
              <ul className="flex flex-col gap-2.5 text-xs">
                {historyQuery.data.items.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3">
                    <span className="text-ink">{AUDIT_ACTION_LABELS[entry.action] ?? entry.action}</span>
                    <span className="shrink-0 text-ink-subtle">{formatDateTime(entry.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
