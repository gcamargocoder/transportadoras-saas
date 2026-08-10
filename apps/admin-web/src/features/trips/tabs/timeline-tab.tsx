'use client';

import { useQuery } from '@tanstack/react-query';
import { Circle } from 'lucide-react';
import { EmptyState } from '../../../components/ui/empty-state';
import { ErrorState } from '../../../components/ui/error-state';
import { LoadingState } from '../../../components/ui/loading-state';
import { getTripTimeline } from '../../../lib/api/trips.api';
import { formatDateTime } from '../../../utils/format';

// Historico operacional da viagem (Fase 28) -- reaproveita o AuditLog ja
// gravado por TripsService (trip.started/paused/resumed/completed/arrived
// etc, ver resolveStatusChangeAction no backend), sem nenhuma tabela de
// eventos nova. Acoes sem rotulo especifico caem no fallback (raw action).
const ACTION_LABELS: Record<string, string> = {
  'trip.created': 'Viagem criada',
  'trip.driver_linked': 'Motorista vinculado',
  'trip.vehicle_linked': 'Veículo vinculado',
  'trip.updated': 'Planejamento atualizado',
  'trip.waiting_driver': 'Aguardando motorista',
  'trip.waiting_departure': 'Aguardando saída',
  'trip.started': 'Viagem iniciada',
  'trip.paused': 'Viagem pausada',
  'trip.resumed': 'Viagem retomada',
  'trip.arrived': 'Chegada ao destino',
  'trip.completed': 'Viagem concluída',
  'trip.cancelled': 'Viagem cancelada',
  'trip.deleted': 'Viagem excluída',
};

export function TimelineTab({ tripId }: { tripId: string }): JSX.Element {
  const query = useQuery({
    queryKey: ['trips', tripId, 'timeline'],
    queryFn: () => getTripTimeline(tripId, { page: 1, pageSize: 100 }),
  });

  if (query.isLoading) return <LoadingState label="Carregando linha do tempo" />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;
  const events = query.data?.items ?? [];
  if (events.length === 0) {
    return (
      <EmptyState
        title="Nenhum evento registrado"
        description="Esta viagem ainda não teve nenhuma mudança de status ou operação registrada."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3 p-4">
      {events.map((event) => (
        <li key={event.id} className="flex items-start gap-3 rounded-md border border-border p-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Circle size={10} fill="currentColor" />
          </span>
          <div>
            <p className="text-sm font-medium text-ink">
              {ACTION_LABELS[event.action] ?? event.action}
            </p>
            <p className="text-xs text-ink-subtle">{formatDateTime(event.createdAt)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
