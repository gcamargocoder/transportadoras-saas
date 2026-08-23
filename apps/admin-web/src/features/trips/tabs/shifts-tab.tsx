'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '../../../components/ui/badge';
import { EmptyState } from '../../../components/ui/empty-state';
import { ErrorState } from '../../../components/ui/error-state';
import { LoadingState } from '../../../components/ui/loading-state';
import { getTripShifts } from '../../../lib/api/trips.api';
import { DRIVER_SHIFT_STATUS_LABELS, TRIP_STOP_TYPE_LABELS } from '../../../lib/labels';
import { DRIVER_SHIFT_STATUS_TONE } from '../status';
import { formatDateTime } from '../../../utils/format';

// Fase 67 -- leitura administrativa das jornadas de motorista vinculadas a
// esta viagem (inicio/pausas/retorno/encerramento). Controle (iniciar/
// pausar/retomar/encerrar) e exclusivo do app do motorista.
export function ShiftsTab({ tripId }: { tripId: string }): JSX.Element {
  const query = useQuery({
    queryKey: ['trip-shifts', tripId],
    queryFn: () => getTripShifts(tripId),
  });

  if (query.isLoading) return <LoadingState label="Carregando jornadas" />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;
  const shifts = query.data ?? [];
  if (shifts.length === 0) {
    return (
      <EmptyState
        title="Nenhuma jornada registrada"
        description="O motorista ainda não iniciou uma jornada vinculada a esta viagem pelo aplicativo."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-4 p-4">
      {shifts.map((shift) => (
        <li key={shift.id} className="rounded-md border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-ink">
                {formatDateTime(shift.startedAt)}
                {shift.endedAt ? ` — ${formatDateTime(shift.endedAt)}` : ''}
              </p>
              <p className="text-xs text-ink-subtle">
                {shift.durationMinutes !== null
                  ? `Duração total: ${shift.durationMinutes} min · Trabalhado: ${shift.workedMinutes} min`
                  : 'Em andamento'}
              </p>
            </div>
            <Badge tone={DRIVER_SHIFT_STATUS_TONE[shift.status]}>{DRIVER_SHIFT_STATUS_LABELS[shift.status]}</Badge>
          </div>

          {shift.breaks.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
              {shift.breaks.map((b) => (
                <li key={b.id} className="flex items-center justify-between text-xs text-ink-subtle">
                  <span>
                    {TRIP_STOP_TYPE_LABELS[b.type]} · {formatDateTime(b.startedAt)}
                    {b.endedAt ? ` — ${formatDateTime(b.endedAt)}` : ' (em curso)'}
                  </span>
                  {b.durationMinutes !== null && <span>{b.durationMinutes} min</span>}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
