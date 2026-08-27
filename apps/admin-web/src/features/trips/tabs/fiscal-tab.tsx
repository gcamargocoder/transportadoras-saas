'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { FileUp, Link2, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { ErrorState } from '../../../components/ui/error-state';
import { SkeletonCards } from '../../../components/ui/skeleton';
import { StatCard } from '../../../components/ui/stat-card';
import { useToast } from '../../../components/ui/toast';
import { toFriendlyMessage } from '../../../lib/api/errors';
import { FiscalDocumentDetailDrawer } from '../../fiscal/fiscal-document-detail-drawer';
import { ImportFiscalXmlModal } from '../../fiscal/import-fiscal-xml-modal';
import { LinkExistingDocumentModal } from '../../fiscal/link-existing-document-modal';
import { UploadFiscalDocumentModal } from '../../fiscal/upload-fiscal-document-modal';
import { useAuth } from '../../../hooks/use-auth';
import { getTripDocumentStatus, listFiscalDocuments, updateFiscalDocument } from '../../../lib/api/fiscal.api';
import { hasRole, FISCAL_DOCUMENT_WRITE_ROLES } from '../../../lib/auth/roles';
import {
  DELIVERY_PROOF_STATUS_LABELS,
  DELIVERY_PROOF_STATUS_TONE,
  FISCAL_DOCUMENT_ORIGIN_LABELS,
  FISCAL_DOCUMENT_STATUS_LABELS,
  FISCAL_DOCUMENT_STATUS_TONE,
  FISCAL_DOCUMENT_TYPE_LABELS,
  FISCAL_ISSUE_CODE_LABELS,
  TRIP_DOCUMENT_COMPLIANCE_STATUS_LABELS,
  TRIP_DOCUMENT_COMPLIANCE_STATUS_TONE,
} from '../../../lib/labels';
import type { FiscalDocumentEntity, TripDocumentMatrixRowEntity } from '../../../types/entities';
import { formatCurrency, formatDate } from '../../../utils/format';

function documentAmount(document: FiscalDocumentEntity): number | null {
  const value = document.metadata?.amount;
  return typeof value === 'number' ? value : null;
}

// Secao "Documentos fiscais" do detalhe da viagem (Fase 52, estendida na
// Fase 53 com status documental consolidado + tabela detalhada + vinculo
// de documento ja existente). So LISTA/vincula documentos via
// GET/PATCH /fiscal/documents -- nunca altera o fluxo operacional da
// viagem em si (nenhum campo/estado da Trip e tocado).
export function FiscalTab({ tripId }: { tripId: string }): JSX.Element {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [uploadCiotOpen, setUploadCiotOpen] = useState(false);
  const [linkCiotOpen, setLinkCiotOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<FiscalDocumentEntity | null>(null);
  const canWrite = hasRole(user?.role, FISCAL_DOCUMENT_WRITE_ROLES);

  const statusQuery = useQuery({
    queryKey: ['fiscal-documents', 'trip-status', tripId],
    queryFn: ({ signal }) => getTripDocumentStatus(tripId, signal),
  });

  const query = useQuery({
    queryKey: ['fiscal-documents', { tripId }],
    queryFn: () => listFiscalDocuments({ tripId, pageSize: 50 }),
  });

  const deliveryProofDocuments = (query.data?.items ?? []).filter((d) => d.documentType === 'DELIVERY_PROOF');
  const ciotDocuments = (query.data?.items ?? []).filter((d) => d.documentType === 'CIOT');

  const linkCandidateMutation = useMutation({
    mutationFn: (documentId: string) => updateFiscalDocument(documentId, { tripId }),
    onSuccess: () => {
      toast.success('Documento vinculado à viagem.');
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents'] });
    },
    onError: (error) => toast.error('Não foi possível vincular o documento.', toFriendlyMessage(error)),
  });

  const matrixColumns = useMemo<ColumnDef<TripDocumentMatrixRowEntity, unknown>[]>(
    () => [
      {
        header: 'Tipo',
        cell: ({ row }) => <Badge tone={row.original.present ? 'brand' : 'neutral'}>{FISCAL_DOCUMENT_TYPE_LABELS[row.original.documentType]}</Badge>,
      },
      { header: 'Total', accessorFn: (row) => row.totalCount },
      { header: 'Válidos', accessorFn: (row) => row.structurallyValidCount },
      { header: 'Pendentes', accessorFn: (row) => row.pendingCount },
      { header: 'Inválidos', accessorFn: (row) => row.invalidCount },
      { header: 'Cancelados', accessorFn: (row) => row.cancelledCount },
      { header: 'Problemáticos', accessorFn: (row) => row.problematicCount },
      { header: 'Duplicados', accessorFn: (row) => row.duplicateCandidateCount },
      { header: 'Não vinculados relacionados', accessorFn: (row) => row.unlinkedRelatedCount },
      { header: 'Relacionados (MDF-e ↔ CT-e/NF-e)', accessorFn: (row) => row.relatedCount },
    ],
    [],
  );

  const columns = useMemo<ColumnDef<FiscalDocumentEntity, unknown>[]>(
    () => [
      { header: 'Documento', accessorFn: (row) => row.fileName ?? '—' },
      {
        header: 'Tipo',
        cell: ({ row }) => <Badge tone="brand">{FISCAL_DOCUMENT_TYPE_LABELS[row.original.documentType]}</Badge>,
      },
      { header: 'Número', accessorFn: (row) => row.documentNumber ?? '—' },
      { header: 'Série', accessorFn: (row) => row.series ?? '—' },
      {
        header: 'Chave',
        cell: ({ row }) => (row.original.accessKey ? <span className="font-mono text-xs">…{row.original.accessKey.slice(-8)}</span> : '—'),
      },
      { header: 'Emitente', accessorFn: (row) => row.senderName ?? '—' },
      { header: 'Destinatário', accessorFn: (row) => row.recipientName ?? '—' },
      { header: 'Valor', cell: ({ row }) => (documentAmount(row.original) !== null ? formatCurrency(documentAmount(row.original)) : '—') },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={FISCAL_DOCUMENT_STATUS_TONE[row.original.status]}>
            {FISCAL_DOCUMENT_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      { header: 'Data', cell: ({ row }) => (row.original.issueDate ? formatDate(row.original.issueDate) : '—') },
      {
        header: 'Situação estrutural',
        cell: ({ row }) =>
          row.original.validationIssues.length === 0 ? (
            <Badge tone="success">Sem inconsistências</Badge>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.original.validationIssues.map((issue) => (
                <Badge key={issue} tone="danger">
                  {FISCAL_ISSUE_CODE_LABELS[issue]}
                </Badge>
              ))}
            </div>
          ),
      },
    ],
    [],
  );

  return (
    <div>
      {statusQuery.isLoading && (
        <div className="p-3">
          <SkeletonCards count={4} />
        </div>
      )}
      {statusQuery.isError && (
        <div className="p-3">
          <ErrorState onRetry={() => statusQuery.refetch()} />
        </div>
      )}
      {statusQuery.data && (
        <div className="flex items-center gap-2 px-3 pt-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Situação documental:</span>
          <Badge tone={TRIP_DOCUMENT_COMPLIANCE_STATUS_TONE[statusQuery.data.complianceStatus]}>
            {TRIP_DOCUMENT_COMPLIANCE_STATUS_LABELS[statusQuery.data.complianceStatus]}
          </Badge>
        </div>
      )}
      {statusQuery.data && (
        <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
          <StatCard label="Documentos" value={String(statusQuery.data.totalDocuments)} />
          <StatCard label="Pendentes" value={String(statusQuery.data.pendingCount)} tone={statusQuery.data.pendingCount > 0 ? 'warning' : 'success'} />
          <StatCard label="Inválidos" value={String(statusQuery.data.invalidCount)} tone={statusQuery.data.invalidCount > 0 ? 'danger' : 'success'} />
          <StatCard label="Cancelados" value={String(statusQuery.data.cancelledCount)} />
          <StatCard label="Estruturalmente válidos" value={String(statusQuery.data.structurallyValidCount)} tone="success" />
          <StatCard
            label="Com pendência/problema"
            value={String(statusQuery.data.problematicCount)}
            tone={statusQuery.data.problematicCount > 0 ? 'warning' : 'success'}
          />
        </div>
      )}
      {statusQuery.data && statusQuery.data.totalDocuments > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2 text-xs">
          <span className="text-ink-subtle">Tipos presentes:</span>
          {statusQuery.data.presentTypes.length === 0 && <span className="text-ink-subtle">nenhum</span>}
          {statusQuery.data.presentTypes.map((t) => (
            <Badge key={t} tone="success">
              {FISCAL_DOCUMENT_TYPE_LABELS[t]}
            </Badge>
          ))}
        </div>
      )}
      {statusQuery.data && (
        <p className="px-3 pb-2 text-xs text-ink-subtle">
          {statusQuery.data.completenessAvailable
            ? `Completude documental: ${statusQuery.data.completenessPercent}%`
            : 'Completude documental indisponível — não há regra de negócio definindo quais documentos esta viagem deveria ter.'}{' '}
          Validação apenas estrutural (formato/chave/vínculo), nunca autorização perante a SEFAZ.
        </p>
      )}

      {statusQuery.data && statusQuery.data.totalDocuments > 0 && (
        <div className="px-3 pb-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Matriz documental por tipo</p>
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <DataTable columns={matrixColumns} data={statusQuery.data.matrix} isLoading={false} isError={false} getRowId={(row) => row.documentType} />
          </div>
        </div>
      )}

      {statusQuery.data && statusQuery.data.unlinkedCandidates.length > 0 && (
        <div className="px-3 pb-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Documentos não vinculados com evidência em comum (mesmo veículo/motorista/cliente)
          </p>
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-white">
            {statusQuery.data.unlinkedCandidates.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <button type="button" onClick={() => setSelectedDocument(d)} className="min-w-0 text-left hover:underline">
                  <span className="block truncate text-sm text-ink">
                    {FISCAL_DOCUMENT_TYPE_LABELS[d.documentType]} · {d.documentNumber ?? d.fileName ?? d.id.slice(0, 8)}
                  </span>
                </button>
                {canWrite && (
                  <Button variant="outline" size="sm" onClick={() => linkCandidateMutation.mutate(d.id)} loading={linkCandidateMutation.isPending}>
                    <Link2 size={14} />
                    Vincular
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {statusQuery.data && (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Comprovante de entrega</p>
            <Badge tone={DELIVERY_PROOF_STATUS_TONE[statusQuery.data.deliveryProofStatus]}>
              {DELIVERY_PROOF_STATUS_LABELS[statusQuery.data.deliveryProofStatus]}
            </Badge>
          </div>
          {deliveryProofDocuments.length === 0 ? (
            <p className="mt-1.5 text-xs text-ink-subtle">
              Nenhum comprovante registrado. O motorista pode enviar pelo app, ou envie manualmente abaixo.
            </p>
          ) : (
            <ul className="mt-1.5 flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-white">
              {deliveryProofDocuments.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedDocument(d)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-subtle"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink">{d.fileName ?? d.id.slice(0, 8)}</span>
                      <span className="block truncate text-xs text-ink-subtle">
                        {d.issueDate ? formatDate(d.issueDate) : '—'} · {FISCAL_DOCUMENT_ORIGIN_LABELS[d.origin]}
                        {typeof d.metadata?.observation === 'string' && d.metadata.observation ? ` · ${d.metadata.observation}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {d.tripDeliveryStopId ? (
                        <Badge tone="brand">Parada #{d.tripDeliveryStopSequence ?? '?'}</Badge>
                      ) : (
                        <Badge tone="neutral">Sem parada vinculada</Badge>
                      )}
                      {d.validationIssues.length > 0 && <Badge tone="danger">{d.validationIssues.length} problema(s)</Badge>}
                      <Badge tone={FISCAL_DOCUMENT_STATUS_TONE[d.status]}>{FISCAL_DOCUMENT_STATUS_LABELS[d.status]}</Badge>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-[11px] text-ink-subtle">
            Comprovante de entrega é evidência documental operacional. Sua existência não representa validação fiscal perante a SEFAZ.
            Abra o detalhe do documento para visualizar/baixar o arquivo original.
          </p>
        </div>
      )}

      {statusQuery.data && (
        <div className="px-3 pb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">CIOT</p>
          {ciotDocuments.length === 0 ? (
            <p className="mt-1.5 text-xs text-ink-subtle">
              Nenhum CIOT vinculado a esta viagem. Ausência de CIOT não é tratada como erro — vincule um já existente ou cadastre abaixo, quando aplicável.
            </p>
          ) : (
            <ul className="mt-1.5 flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-white">
              {ciotDocuments.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedDocument(d)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-subtle"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink">{d.documentNumber ?? d.fileName ?? d.id.slice(0, 8)}</span>
                      <span className="block truncate text-xs text-ink-subtle">
                        {d.issueDate ? formatDate(d.issueDate) : '—'} · {d.vehiclePlate ?? 'sem veículo'} · {d.driverName ?? 'sem motorista'}
                        {d.customerName ? ` · ${d.customerName}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {d.validationIssues.length > 0 && <Badge tone="danger">{d.validationIssues.length} problema(s)</Badge>}
                      <Badge tone={FISCAL_DOCUMENT_STATUS_TONE[d.status]}>{FISCAL_DOCUMENT_STATUS_LABELS[d.status]}</Badge>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-[11px] text-ink-subtle">
            CIOT armazenado e validado estruturalmente pelo sistema não representa emissão, autorização ou validação oficial perante a ANTT/órgão externo.
          </p>
          {canWrite && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setLinkCiotOpen(true)}>
                <Link2 size={14} />
                Vincular CIOT existente
              </Button>
              <Button variant="outline" size="sm" onClick={() => setUploadCiotOpen(true)}>
                <Plus size={14} />
                Cadastrar CIOT
              </Button>
            </div>
          )}
        </div>
      )}

      {canWrite && (
        <div className="flex flex-wrap justify-end gap-2 p-3">
          <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
            <Link2 size={14} />
            Vincular existente
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <FileUp size={14} />
            Importar XML
          </Button>
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Plus size={14} />
            Enviar documento
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        getRowId={(d) => d.id}
        onRowClick={(d) => setSelectedDocument(d)}
        emptyTitle="Nenhum documento fiscal vinculado a esta viagem"
      />

      <UploadFiscalDocumentModal open={uploadOpen} onClose={() => setUploadOpen(false)} tripId={tripId} />
      <ImportFiscalXmlModal open={importOpen} onClose={() => setImportOpen(false)} tripId={tripId} />
      <LinkExistingDocumentModal open={linkOpen} onClose={() => setLinkOpen(false)} tripId={tripId} />
      <UploadFiscalDocumentModal open={uploadCiotOpen} onClose={() => setUploadCiotOpen(false)} tripId={tripId} defaultDocumentType="CIOT" />
      <LinkExistingDocumentModal open={linkCiotOpen} onClose={() => setLinkCiotOpen(false)} tripId={tripId} documentType="CIOT" />
      <FiscalDocumentDetailDrawer document={selectedDocument} onClose={() => setSelectedDocument(null)} />
    </div>
  );
}
