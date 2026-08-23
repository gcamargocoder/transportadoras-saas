'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, MoreHorizontal, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { Dropdown } from '../../../components/ui/dropdown';
import { useToast } from '../../../components/ui/toast';
import { useAuth } from '../../../hooks/use-auth';
import { toFriendlyMessage } from '../../../lib/api/errors';
import { cancelTripOccurrence, getTripOccurrences, resolveTripOccurrence } from '../../../lib/api/trips.api';
import { hasRole, TRIP_WRITE_ROLES } from '../../../lib/auth/roles';
import {
  TRIP_OCCURRENCE_SEVERITY_LABELS,
  TRIP_OCCURRENCE_STATUS_LABELS,
  TRIP_OCCURRENCE_TYPE_LABELS,
} from '../../../lib/labels';
import { TRIP_OCCURRENCE_SEVERITY_TONE, TRIP_OCCURRENCE_STATUS_TONE } from '../status';
import { CreateOccurrenceModal } from '../create-occurrence-modal';
import type { TripOccurrenceEntity } from '../../../types/entities';
import { formatDateTime } from '../../../utils/format';

export function OccurrencesTab({ tripId }: { tripId: string }): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ['trip-occurrences', tripId],
    queryFn: () => getTripOccurrences(tripId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['trip-occurrences', tripId] });
    queryClient.invalidateQueries({ queryKey: ['trips', tripId, 'timeline'] });
  };

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
      { header: 'Tipo', accessorFn: (row) => TRIP_OCCURRENCE_TYPE_LABELS[row.type] },
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
      ...(canWrite
        ? [
            {
              id: 'actions',
              header: '',
              cell: ({ row }: { row: { original: TripOccurrenceEntity } }) =>
                row.original.status === 'OPEN' ? (
                  <Dropdown
                    trigger={
                      <span className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-muted hover:text-ink">
                        <MoreHorizontal size={16} />
                      </span>
                    }
                    items={[
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
                ) : null,
            } satisfies ColumnDef<TripOccurrenceEntity, unknown>,
          ]
        : []),
    ],
    [canWrite, resolveMutation, cancelMutation],
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
    </div>
  );
}
