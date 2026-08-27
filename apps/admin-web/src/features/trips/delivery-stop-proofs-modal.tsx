'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Modal } from '../../components/ui/modal';
import { FiscalDocumentDetailDrawer } from '../fiscal/fiscal-document-detail-drawer';
import { listFiscalDocuments } from '../../lib/api/fiscal.api';
import { FISCAL_DOCUMENT_ORIGIN_LABELS, FISCAL_DOCUMENT_STATUS_LABELS, FISCAL_DOCUMENT_STATUS_TONE } from '../../lib/labels';
import type { FiscalDocumentEntity } from '../../types/entities';
import { formatDate } from '../../utils/format';

// Fase 100 -- "consulta na entrega": comprovantes (POD) vinculados
// diretamente a UMA parada especifica. Reaproveita integralmente
// GET /fiscal/documents (filtro tripDeliveryStopId) e o drawer de detalhe
// ja existente -- nenhuma segunda listagem/visualizacao de documento.
export function DeliveryStopProofsModal({
  open,
  onClose,
  tripDeliveryStopId,
  stopLabel,
}: {
  open: boolean;
  onClose: () => void;
  tripDeliveryStopId: string | null;
  stopLabel: string;
}): JSX.Element {
  const [selectedDocument, setSelectedDocument] = useState<FiscalDocumentEntity | null>(null);

  const query = useQuery({
    queryKey: ['fiscal-documents', { tripDeliveryStopId }],
    queryFn: () => listFiscalDocuments({ tripDeliveryStopId: tripDeliveryStopId as string, pageSize: 50 }),
    enabled: open && tripDeliveryStopId !== null,
  });

  return (
    <>
      <Modal open={open} onClose={onClose} title={`Comprovantes — ${stopLabel}`} size="md">
        {query.isLoading && <p className="p-4 text-sm text-ink-subtle">Carregando…</p>}
        {query.data && query.data.items.length === 0 && (
          <p className="p-4 text-sm text-ink-subtle">Nenhum comprovante registrado para esta parada ainda.</p>
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
                      {d.issueDate ? formatDate(d.issueDate) : '—'} · {FISCAL_DOCUMENT_ORIGIN_LABELS[d.origin]}
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
    </>
  );
}
