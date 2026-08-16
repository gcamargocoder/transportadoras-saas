'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { FileUp, Link2, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { ErrorState } from '../../../components/ui/error-state';
import { SkeletonCards } from '../../../components/ui/skeleton';
import { StatCard } from '../../../components/ui/stat-card';
import { FiscalDocumentDetailDrawer } from '../../fiscal/fiscal-document-detail-drawer';
import { ImportFiscalXmlModal } from '../../fiscal/import-fiscal-xml-modal';
import { LinkExistingDocumentModal } from '../../fiscal/link-existing-document-modal';
import { UploadFiscalDocumentModal } from '../../fiscal/upload-fiscal-document-modal';
import { useAuth } from '../../../hooks/use-auth';
import { getTripDocumentStatus, listFiscalDocuments } from '../../../lib/api/fiscal.api';
import { hasRole, FISCAL_DOCUMENT_WRITE_ROLES } from '../../../lib/auth/roles';
import {
  FISCAL_DOCUMENT_STATUS_LABELS,
  FISCAL_DOCUMENT_STATUS_TONE,
  FISCAL_DOCUMENT_TYPE_LABELS,
  FISCAL_ISSUE_CODE_LABELS,
} from '../../../lib/labels';
import type { FiscalDocumentEntity } from '../../../types/entities';
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
  const [uploadOpen, setUploadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
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
      <FiscalDocumentDetailDrawer document={selectedDocument} onClose={() => setSelectedDocument(null)} />
    </div>
  );
}
