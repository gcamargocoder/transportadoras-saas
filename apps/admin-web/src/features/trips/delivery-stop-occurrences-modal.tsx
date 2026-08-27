'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, MoreHorizontal, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Dropdown } from '../../components/ui/dropdown';
import { Modal } from '../../components/ui/modal';
import { useToast } from '../../components/ui/toast';
import { useAuth } from '../../hooks/use-auth';
import { toFriendlyMessage } from '../../lib/api/errors';
import {
  cancelDeliveryOccurrence,
  listDeliveryOccurrences,
  markDeliveryOccurrenceInProgress,
  resolveDeliveryOccurrence,
} from '../../lib/api/trips.api';
import { hasRole, TRIP_WRITE_ROLES } from '../../lib/auth/roles';
import { TRIP_OCCURRENCE_SEVERITY_LABELS, TRIP_OCCURRENCE_STATUS_LABELS, TRIP_OCCURRENCE_TYPE_LABELS } from '../../lib/labels';
import { TRIP_OCCURRENCE_SEVERITY_TONE, TRIP_OCCURRENCE_STATUS_TONE } from './status';
import { CreateOccurrenceModal } from './create-occurrence-modal';
import { formatDateTime } from '../../utils/format';

// Fase 101 -- "consulta na entrega": ocorrencias vinculadas diretamente a
// UMA parada especifica. Reaproveita integralmente GET /delivery-occurrences
// (filtro tripDeliveryStopId) e as mesmas mutations cross-trip de
// start/resolve/cancel -- mesmo padrao de DeliveryStopProofsModal (Fase 100).
export function DeliveryStopOccurrencesModal({
  open,
  onClose,
  tripId,
  tripDeliveryStopId,
  stopLabel,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  tripDeliveryStopId: string | null;
  stopLabel: string;
}): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canWrite = hasRole(user?.role, TRIP_WRITE_ROLES);
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ['delivery-occurrences', { tripDeliveryStopId }],
    queryFn: () => listDeliveryOccurrences({ tripDeliveryStopId: tripDeliveryStopId as string, pageSize: 50 }),
    enabled: open && tripDeliveryStopId !== null,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['delivery-occurrences'] });
    queryClient.invalidateQueries({ queryKey: ['trip-occurrences', tripId] });
    queryClient.invalidateQueries({ queryKey: ['trips', tripId, 'timeline'] });
  };

  const startMutation = useMutation({
    mutationFn: (id: string) => markDeliveryOccurrenceInProgress(id),
    onSuccess: () => {
      toast.success('Ocorrência marcada como em andamento.');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível atualizar a ocorrência.', toFriendlyMessage(error)),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => resolveDeliveryOccurrence(id),
    onSuccess: () => {
      toast.success('Ocorrência resolvida.');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível resolver a ocorrência.', toFriendlyMessage(error)),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelDeliveryOccurrence(id),
    onSuccess: () => {
      toast.success('Ocorrência cancelada.');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível cancelar a ocorrência.', toFriendlyMessage(error)),
  });

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Ocorrências — ${stopLabel}`}
        size="lg"
        footer={
          canWrite ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={14} />
              Nova ocorrência
            </Button>
          ) : undefined
        }
      >
        {query.isLoading && <p className="p-4 text-sm text-ink-subtle">Carregando…</p>}
        {query.data && query.data.items.length === 0 && (
          <p className="p-4 text-sm text-ink-subtle">Nenhuma ocorrência registrada para esta parada ainda.</p>
        )}
        {query.data && query.data.items.length > 0 && (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-white">
            {query.data.items.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm text-ink">{TRIP_OCCURRENCE_TYPE_LABELS[o.type]}</span>
                    <Badge tone={TRIP_OCCURRENCE_SEVERITY_TONE[o.severity]}>{TRIP_OCCURRENCE_SEVERITY_LABELS[o.severity]}</Badge>
                    <Badge tone={TRIP_OCCURRENCE_STATUS_TONE[o.status]}>{TRIP_OCCURRENCE_STATUS_LABELS[o.status]}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-subtle">{o.description}</p>
                  <p className="text-xs text-ink-subtle">{formatDateTime(o.occurredAt)}</p>
                </div>
                {canWrite && (o.status === 'OPEN' || o.status === 'IN_PROGRESS') && (
                  <Dropdown
                    trigger={
                      <span className="shrink-0 rounded-md p-1.5 text-ink-subtle hover:bg-surface-muted hover:text-ink">
                        <MoreHorizontal size={16} />
                      </span>
                    }
                    items={[
                      ...(o.status === 'OPEN'
                        ? [
                            {
                              label: 'Marcar em andamento',
                              icon: <Loader2 size={14} />,
                              onClick: () => startMutation.mutate(o.id),
                            },
                          ]
                        : []),
                      { label: 'Resolver', icon: <Check size={14} />, onClick: () => resolveMutation.mutate(o.id) },
                      { label: 'Cancelar registro', icon: <X size={14} />, danger: true, onClick: () => cancelMutation.mutate(o.id) },
                    ]}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal>
      {tripDeliveryStopId && (
        <CreateOccurrenceModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          tripId={tripId}
          tripDeliveryStopId={tripDeliveryStopId}
          stopLabel={stopLabel}
        />
      )}
    </>
  );
}
