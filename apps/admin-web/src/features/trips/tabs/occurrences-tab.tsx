'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, Loader2, MoreHorizontal, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { Dropdown } from '../../../components/ui/dropdown';
import { useToast } from '../../../components/ui/toast';
import { useAuth } from '../../../hooks/use-auth';
import { listFiscalDocuments } from '../../../lib/api/fiscal.api';
import { toFriendlyMessage } from '../../../lib/api/errors';
import {
  cancelTripOccurrence,
  getTripDeliveryStops,
  getTripOccurrences,
  markTripOccurrenceInProgress,
  resolveTripOccurrence,
} from '../../../lib/api/trips.api';
import { hasRole, TRIP_WRITE_ROLES } from '../../../lib/auth/roles';
import {
  TRIP_OCCURRENCE_SEVERITY_LABELS,
  TRIP_OCCURRENCE_STATUS_LABELS,
  TRIP_OCCURRENCE_TYPE_LABELS,
} from '../../../lib/labels';
import { TRIP_OCCURRENCE_SEVERITY_TONE, TRIP_OCCURRENCE_STATUS_TONE } from '../status';
import { CreateOccurrenceModal } from '../create-occurrence-modal';
import { OccurrenceDocumentsModal } from '../occurrence-documents-modal';
import type { TripOccurrenceEntity } from '../../../types/entities';
import { formatDateTime } from '../../../utils/format';

export function OccurrencesTab({ tripId }: { tripId: string }): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewingDocumentsOccurrence, setViewingDocumentsOccurrence] = useState<TripOccurrenceEntity | null>(null);

  const query = useQuery({
    queryKey: ['trip-occurrences', tripId],
    queryFn: () => getTripOccurrences(tripId),
  });

  // Fase 102 -- documentos/evidencias vinculados as ocorrencias desta
  // viagem, buscados UMA VEZ para a aba inteira e agrupados por ocorrencia
  // em memoria (mesmo principio ja usado para Comprovantes/Ocorrencias na
  // aba de Entregas -- nunca 1 consulta por linha da tabela).
  const documentsQuery = useQuery({
    queryKey: ['fiscal-documents', { tripId, hasTripOccurrence: true }],
    queryFn: () => listFiscalDocuments({ tripId, pageSize: 100 }),
  });
  const documentCountByOccurrenceId = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of documentsQuery.data?.items ?? []) {
      if (!d.tripOccurrenceId) continue;
      map.set(d.tripOccurrenceId, (map.get(d.tripOccurrenceId) ?? 0) + 1);
    }
    return map;
  }, [documentsQuery.data]);

  // Fase 101 -- so para exibir a badge "Parada #N" quando a ocorrencia esta
  // vinculada; nunca uma segunda fonte de dados da parada em si.
  const stopsQuery = useQuery({
    queryKey: ['trip-delivery-stops', tripId],
    queryFn: () => getTripDeliveryStops(tripId),
  });
  const stopSequenceById = useMemo(
    () => new Map((stopsQuery.data ?? []).map((s) => [s.id, s.sequence])),
    [stopsQuery.data],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['trip-occurrences', tripId] });
    queryClient.invalidateQueries({ queryKey: ['trips', tripId, 'timeline'] });
    queryClient.invalidateQueries({ queryKey: ['delivery-occurrences'] });
  };

  const startMutation = useMutation({
    mutationFn: (occurrenceId: string) => markTripOccurrenceInProgress(tripId, occurrenceId),
    onSuccess: () => {
      toast.success('Ocorrência marcada como em andamento.');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível atualizar a ocorrência.', toFriendlyMessage(error)),
  });

  const resolveMutation = useMutation({
    mutationFn: (occurrenceId: string) => resolveTripOccurrence(tripId, occurrenceId),
    onSuccess: () => {
      toast.success('Ocorrência resolvida.');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível resolver a ocorrência.', toFriendlyMessage(error)),
  });

  const cancelMutation = useMutation({
    mutationFn: (occurrenceId: string) => cancelTripOccurrence(tripId, occurrenceId),
    onSuccess: () => {
      toast.success('Ocorrência cancelada.');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível cancelar a ocorrência.', toFriendlyMessage(error)),
  });

  const canWrite = hasRole(user?.role, TRIP_WRITE_ROLES);

  const columns = useMemo<ColumnDef<TripOccurrenceEntity, unknown>[]>(
    () => [
      { header: 'Quando', cell: ({ row }) => formatDateTime(row.original.occurredAt) },
      {
        header: 'Tipo',
        cell: ({ row }) => {
          const sequence = row.original.tripDeliveryStopId
            ? stopSequenceById.get(row.original.tripDeliveryStopId)
            : undefined;
          return (
            <div>
              <div>{TRIP_OCCURRENCE_TYPE_LABELS[row.original.type]}</div>
              {sequence !== undefined && <div className="text-xs text-ink-subtle">Parada #{sequence}</div>}
            </div>
          );
        },
      },
      {
        header: 'Severidade',
        cell: ({ row }) => (
          <Badge tone={TRIP_OCCURRENCE_SEVERITY_TONE[row.original.severity]}>
            {TRIP_OCCURRENCE_SEVERITY_LABELS[row.original.severity]}
          </Badge>
        ),
      },
      { header: 'Descrição', accessorFn: (row) => row.description },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={TRIP_OCCURRENCE_STATUS_TONE[row.original.status]}>
            {TRIP_OCCURRENCE_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      {
        // Fase 102 -- documentos/evidencias vinculados diretamente a esta
        // ocorrencia (FiscalDocument.tripOccurrenceId).
        header: 'Documentos',
        cell: ({ row }) => {
          const count = documentCountByOccurrenceId.get(row.original.id) ?? 0;
          return (
            <button type="button" onClick={() => setViewingDocumentsOccurrence(row.original)} className="inline-flex">
              <Badge tone={count > 0 ? 'brand' : 'neutral'}>{count > 0 ? `${count} documento(s)` : 'Nenhum'}</Badge>
            </button>
          );
        },
      },
      ...(canWrite
        ? [
            {
              id: 'actions',
              header: '',
              cell: ({ row }: { row: { original: TripOccurrenceEntity } }) => {
                const status = row.original.status;
                if (status !== 'OPEN' && status !== 'IN_PROGRESS') return null;
                return (
                  <Dropdown
                    trigger={
                      <span className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-muted hover:text-ink">
                        <MoreHorizontal size={16} />
                      </span>
                    }
                    items={[
                      ...(status === 'OPEN'
                        ? [
                            {
                              label: 'Marcar em andamento',
                              icon: <Loader2 size={14} />,
                              onClick: () => startMutation.mutate(row.original.id),
                            },
                          ]
                        : []),
                      {
                        label: 'Resolver',
                        icon: <Check size={14} />,
                        onClick: () => resolveMutation.mutate(row.original.id),
                      },
                      {
                        label: 'Cancelar registro',
                        icon: <X size={14} />,
                        danger: true,
                        onClick: () => cancelMutation.mutate(row.original.id),
                      },
                    ]}
                  />
                );
              },
            } satisfies ColumnDef<TripOccurrenceEntity, unknown>,
          ]
        : []),
    ],
    [canWrite, startMutation, resolveMutation, cancelMutation, stopSequenceById, documentCountByOccurrenceId],
  );

  return (
    <div>
      {canWrite && (
        <div className="flex justify-end p-3">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            Nova ocorrência
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        data={query.data ?? []}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        getRowId={(e) => e.id}
        emptyTitle="Nenhuma ocorrência registrada nesta viagem"
      />
      <CreateOccurrenceModal open={createOpen} onClose={() => setCreateOpen(false)} tripId={tripId} />
      <OccurrenceDocumentsModal
        open={Boolean(viewingDocumentsOccurrence)}
        onClose={() => setViewingDocumentsOccurrence(null)}
        tripId={tripId}
        tripOccurrenceId={viewingDocumentsOccurrence?.id ?? null}
        occurrenceLabel={viewingDocumentsOccurrence ? TRIP_OCCURRENCE_TYPE_LABELS[viewingDocumentsOccurrence.type] : ''}
      />
    </div>
  );
}
