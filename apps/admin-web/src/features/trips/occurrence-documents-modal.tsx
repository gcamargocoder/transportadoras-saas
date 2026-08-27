'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/modal';
import { useAuth } from '../../hooks/use-auth';
import { listFiscalDocuments } from '../../lib/api/fiscal.api';
import { hasRole, TRIP_WRITE_ROLES } from '../../lib/auth/roles';
import { FISCAL_DOCUMENT_STATUS_LABELS, FISCAL_DOCUMENT_STATUS_TONE, FISCAL_DOCUMENT_TYPE_LABELS } from '../../lib/labels';
import { FiscalDocumentDetailDrawer } from '../fiscal/fiscal-document-detail-drawer';
import { UploadFiscalDocumentModal } from '../fiscal/upload-fiscal-document-modal';
import type { FiscalDocumentEntity } from '../../types/entities';
import { formatDate } from '../../utils/format';

// Fase 102 -- "consulta na ocorrencia": documentos/evidencias vinculados
// diretamente a UMA ocorrencia especifica. Reaproveita integralmente
// GET /fiscal/documents (filtro tripOccurrenceId), o modal de upload e o
// drawer de detalhe ja existentes -- nenhuma segunda listagem/visualizacao
// de documento. Mesmo padrao de DeliveryStopProofsModal (Fase 100).
export function OccurrenceDocumentsModal({
  open,
  onClose,
  tripId,
  tripOccurrenceId,
  occurrenceLabel,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  tripOccurrenceId: string | null;
  occurrenceLabel: string;
}): JSX.Element {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = hasRole(user?.role, TRIP_WRITE_ROLES);
  const [selectedDocument, setSelectedDocument] = useState<FiscalDocumentEntity | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const query = useQuery({
    queryKey: ['fiscal-documents', { tripOccurrenceId }],
    queryFn: () => listFiscalDocuments({ tripOccurrenceId: tripOccurrenceId as string, pageSize: 50 }),
    enabled: open && tripOccurrenceId !== null,
  });

  function handleUploadClose(): void {
    setUploadOpen(false);
    queryClient.invalidateQueries({ queryKey: ['fiscal-documents', { tripOccurrenceId }] });
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Documentos — ${occurrenceLabel}`}
        size="md"
        footer={
          canWrite ? (
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              Enviar documento
            </Button>
          ) : undefined
        }
      >
        {query.isLoading && <p className="p-4 text-sm text-ink-subtle">Carregando…</p>}
        {query.data && query.data.items.length === 0 && (
          <p className="p-4 text-sm text-ink-subtle">Nenhum documento registrado para esta ocorrência ainda.</p>
        )}
        {query.data && query.data.items.length > 0 && (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-white">
            {query.data.items.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setSelectedDocument(d)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-subtle"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{d.fileName ?? d.id.slice(0, 8)}</span>
                    <span className="block truncate text-xs text-ink-subtle">
                      {d.issueDate ? formatDate(d.issueDate) : '—'} · {FISCAL_DOCUMENT_TYPE_LABELS[d.documentType]}
                    </span>
                  </span>
                  <Badge tone={FISCAL_DOCUMENT_STATUS_TONE[d.status]}>{FISCAL_DOCUMENT_STATUS_LABELS[d.status]}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
      <FiscalDocumentDetailDrawer document={selectedDocument} onClose={() => setSelectedDocument(null)} />
      {tripOccurrenceId && (
        <UploadFiscalDocumentModal
          open={uploadOpen}
          onClose={handleUploadClose}
          tripId={tripId}
          tripOccurrenceId={tripOccurrenceId}
          defaultDocumentType="OCCURRENCE_EVIDENCE"
        />
      )}
    </>
  );
}
