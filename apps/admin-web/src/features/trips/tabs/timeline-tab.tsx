'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '../../../components/ui/empty-state';
import { ErrorState } from '../../../components/ui/error-state';
import { LoadingState } from '../../../components/ui/loading-state';
import { getTripTimeline } from '../../../lib/api/trips.api';
import { formatDateTime } from '../../../utils/format';

const EVENT_LABELS: Record<string, string> = {
  DEVIATION: 'Desvio de rota',
  ACCIDENT: 'Acidente',
  ROADWORK: 'Obra na via',
  INTERDICTION: 'Interdição',
  DESTINATION_CHANGE: 'Mudança de destino',
};

export function TimelineTab({ tripId }: { tripId: string }): JSX.Element {
  const query = useQuery({
    queryKey: ['trips', tripId, 'timeline'],
    queryFn: () => getTripTimeline(tripId),
  });

  if (query.isLoading) return <LoadingState label="Carregando linha do tempo" />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;
  if (!query.data || query.data.length === 0) {
    return (
      <EmptyState
        title="Nenhum evento de rota registrado"
        description="Esta viagem não teve desvios, acidentes ou outros eventos registrados."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3 p-4">
      {query.data.map((event) => (
        <li key={event.id} className="flex items-start gap-3 rounded-md border border-border p-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning-50 text-warning-600">
            <AlertTriangle size={14} />
          </span>
          <div>
            <p className="text-sm font-medium text-ink">{EVENT_LABELS[event.type] ?? event.type}</p>
            <p className="text-xs text-ink-subtle">
              Detectado em {formatDateTime(event.detectedAt)}
              {event.resolvedAt
                ? ` · Resolvido em ${formatDateTime(event.resolvedAt)}`
                : ' · Em aberto'}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
