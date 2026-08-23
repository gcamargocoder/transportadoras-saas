'use client';

import { useQuery } from '@tanstack/react-query';
import { Circle } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { EmptyState } from '../../../components/ui/empty-state';
import { ErrorState } from '../../../components/ui/error-state';
import { LoadingState } from '../../../components/ui/loading-state';
import { Select } from '../../../components/ui/select';
import { getTripTimeline } from '../../../lib/api/trips.api';
import { TRIP_OCCURRENCE_SEVERITY_LABELS, TRIP_TIMELINE_ORIGIN_LABELS } from '../../../lib/labels';
import { TRIP_OCCURRENCE_SEVERITY_TONE } from '../status';
import type { TripTimelineOrigin } from '../../../types/enums';
import { formatDateTime } from '../../../utils/format';

// Fase 67 -- timeline unificada: agrega paradas, eventos de rota,
// abastecimentos, pedagios, excecoes de eixo, checklists, documentos
// fiscais/comprovante de entrega, despesas, receitas, ocorrencias e
// auditoria da viagem numa unica projecao (ver TripTimelineService no
// backend). Antes da Fase 67 esta aba so mostrava AuditLog.
export function TimelineTab({ tripId }: { tripId: string }): JSX.Element {
  const [origin, setOrigin] = useState<TripTimelineOrigin | ''>('');

  const query = useQuery({
    queryKey: ['trips', tripId, 'timeline', { origin }],
    queryFn: () => getTripTimeline(tripId, { page: 1, pageSize: 100, origin: origin || undefined }),
  });

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex justify-end">
        <Select
          value={origin}
          onChange={(e) => setOrigin(e.target.value as TripTimelineOrigin | '')}
          className="w-56"
        >
          <option value="">Todas as origens</option>
          {Object.entries(TRIP_TIMELINE_ORIGIN_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {query.isLoading ? (
        <LoadingState label="Carregando linha do tempo" />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          title="Nenhum evento registrado"
          description="Esta viagem ainda não teve nenhum evento operacional registrado."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {(query.data?.items ?? []).map((event) => (
            <li
              key={`${event.origin}-${event.id}`}
              className="flex items-start gap-3 rounded-md border border-border p-3"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Circle size={10} fill="currentColor" />
              </span>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-ink">{event.label}</p>
                  <Badge tone="neutral">{TRIP_TIMELINE_ORIGIN_LABELS[event.origin]}</Badge>
                  {event.severity && (
                    <Badge tone={TRIP_OCCURRENCE_SEVERITY_TONE[event.severity]}>
                      {TRIP_OCCURRENCE_SEVERITY_LABELS[event.severity]}
                    </Badge>
                  )}
                </div>
                {event.description && <p className="mt-0.5 text-sm text-ink-subtle">{event.description}</p>}
                <p className="mt-0.5 text-xs text-ink-subtle">{formatDateTime(event.occurredAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
