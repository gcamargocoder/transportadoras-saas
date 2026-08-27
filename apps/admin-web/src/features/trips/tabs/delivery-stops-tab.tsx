'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Check, Clock, MoreHorizontal, Pencil, Plus, Route, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { DataTable } from '../../../components/ui/data-table';
import { Dropdown } from '../../../components/ui/dropdown';
import { useToast } from '../../../components/ui/toast';
import { useAuth } from '../../../hooks/use-auth';
import { toFriendlyMessage } from '../../../lib/api/errors';
import {
  applyTripRoutingSuggestion,
  getTripDeliveryStops,
  getTripEta,
  getTripRoutingSuggestion,
  removeTripDeliveryStop,
  reorderTripDeliveryStops,
  updateTripDeliveryStopStatus,
} from '../../../lib/api/trips.api';
import { hasRole, TRIP_WRITE_ROLES } from '../../../lib/auth/roles';
import { TRIP_DELIVERY_STOP_STATUS_LABELS } from '../../../lib/labels';
import { TRIP_DELIVERY_STOP_STATUS_TONE } from '../status';
import { DeliveryStopModal } from '../delivery-stop-modal';
import type { TripDeliveryStopEntity, TripRoutingSuggestionEntity } from '../../../types/entities';
import type { TripDeliveryStopStatus } from '../../../types/enums';
import { formatDateTime } from '../../../utils/format';

function formatVariance(seconds: number): string {
  const minutes = Math.round(Math.abs(seconds) / 60);
  const label = seconds > 0 ? 'atraso' : 'adiantado';
  if (minutes < 60) return `${minutes} min de ${label}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h${rest.toString().padStart(2, '0')} de ${label}`;
}

// Fase 88 -- proximos status validos a partir do atual (mesma regra do
// backend, TripDeliveryStopsService.ALLOWED_STATUS_TRANSITIONS -- so para
// montar as opcoes do menu; o backend e quem realmente valida a transicao).
const NEXT_STATUSES: Record<TripDeliveryStopStatus, TripDeliveryStopStatus[]> = {
  PENDING: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

// Distinta de OperacaoTab (paradas OPERACIONAIS do app do motorista, Fase
// 25/43): esta aba e o PLANEJAMENTO das entregas (sequencia/cliente/local/
// status), sub-recurso de Trip (TripDeliveryStop).
export function DeliveryStopsTab({
  tripId,
  planningAllowed,
  tripFinished,
}: {
  tripId: string;
  planningAllowed: boolean;
  tripFinished: boolean;
}): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingStop, setEditingStop] = useState<TripDeliveryStopEntity | null>(null);
  const [removingStop, setRemovingStop] = useState<TripDeliveryStopEntity | null>(null);
  const [suggestion, setSuggestion] = useState<TripRoutingSuggestionEntity | null>(null);

  const query = useQuery({
    queryKey: ['trip-delivery-stops', tripId],
    queryFn: () => getTripDeliveryStops(tripId),
  });

  // Fase 91 -- previsao de chegada, sempre recalculada pelo backend (nunca
  // persistida); busca automatica junto com a lista, sem exigir uma acao
  // explicita do usuario (leitura leve, ao contrario de roteirizacao/
  // otimizacao, que fazem calculos mais custosos sob demanda).
  const etaQuery = useQuery({
    queryKey: ['trip-delivery-stops-eta', tripId],
    queryFn: () => getTripEta(tripId),
  });
  const etaByStopId = useMemo(
    () => new Map((etaQuery.data?.stops ?? []).map((e) => [e.stopId, e])),
    [etaQuery.data],
  );

  const canWrite = hasRole(user?.role, TRIP_WRITE_ROLES);
  const stops = query.data ?? [];

  // Limpa a sugestao exibida sempre que as paradas mudam por outra via
  // (manual reorder, criar/editar/remover, mudar status) -- uma sugestao
  // calculada antes dessa mudanca ficaria desatualizada.
  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['trip-delivery-stops', tripId] });
    queryClient.invalidateQueries({ queryKey: ['trip-delivery-stops-eta', tripId] });
    setSuggestion(null);
  }

  const reorderMutation = useMutation({
    mutationFn: (items: { id: string; sequence: number }[]) => reorderTripDeliveryStops(tripId, items),
    onSuccess: invalidate,
    onError: (error) => toast.error('Não foi possível reordenar as paradas.', toFriendlyMessage(error)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ stopId, status }: { stopId: string; status: TripDeliveryStopStatus }) =>
      updateTripDeliveryStopStatus(tripId, stopId, status),
    onSuccess: () => {
      toast.success('Status da parada atualizado.');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível atualizar o status.', toFriendlyMessage(error)),
  });

  const removeMutation = useMutation({
    mutationFn: (stopId: string) => removeTripDeliveryStop(tripId, stopId),
    onSuccess: () => {
      toast.success('Parada removida.');
      invalidate();
      setRemovingStop(null);
    },
    onError: (error) => toast.error('Não foi possível remover a parada.', toFriendlyMessage(error)),
  });

  // Fase 89 -- "solicitar roteirização": calcula (sem persistir) e mostra a
  // sequência sugerida para comparação; nada é aplicado até o usuário clicar
  // em "Aplicar sugestão" (regra 4 -- nunca sobrescreve sem ação explícita).
  const suggestMutation = useMutation({
    mutationFn: () => getTripRoutingSuggestion(tripId),
    onSuccess: setSuggestion,
    onError: (error) =>
      toast.error('Não foi possível calcular a sugestão de roteirização.', toFriendlyMessage(error)),
  });

  const applyMutation = useMutation({
    mutationFn: () => applyTripRoutingSuggestion(tripId),
    onSuccess: (result) => {
      toast.success(
        result.applied
          ? `Sequência aplicada (nova versão de rota #${result.routeVersionNumber}).`
          : 'A sequência já estava igual à sugerida — nada foi alterado.',
      );
      setSuggestion(null);
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível aplicar a sugestão.', toFriendlyMessage(error)),
  });

  function move(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= stops.length) return;
    const reordered = [...stops];
    const [moved] = reordered.splice(index, 1);
    if (!moved) return;
    reordered.splice(targetIndex, 0, moved);
    reorderMutation.mutate(reordered.map((s, i) => ({ id: s.id, sequence: i + 1 })));
  }

  const columns = useMemo<ColumnDef<TripDeliveryStopEntity, unknown>[]>(
    () => [
      { header: '#', accessorFn: (row) => row.sequence, size: 40 },
      {
        header: 'Cliente/destinatário',
        cell: ({ row }) => row.original.customerName ?? '—',
      },
      {
        header: 'Local de entrega',
        cell: ({ row }) => (
          <div>
            <div>{row.original.locationName}</div>
            {row.original.locationAddress && (
              <div className="text-xs text-ink-subtle">{row.original.locationAddress}</div>
            )}
          </div>
        ),
      },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={TRIP_DELIVERY_STOP_STATUS_TONE[row.original.status]}>
            {TRIP_DELIVERY_STOP_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      {
        header: 'Planejado × previsto (ETA)',
        cell: ({ row }) => {
          const eta = etaByStopId.get(row.original.id);
          return (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                {row.original.plannedArrival ? formatDateTime(row.original.plannedArrival) : '—'}
                {eta?.isNextStop && <Badge tone="info">Próxima</Badge>}
              </div>
              {eta?.estimatedArrival ? (
                <div className="text-xs text-ink-subtle">
                  Previsto: {formatDateTime(eta.estimatedArrival)}
                  {eta.delayed !== null && eta.varianceSeconds !== null && (
                    <Badge tone={eta.delayed ? 'warning' : 'success'} className="ml-1.5">
                      {formatVariance(eta.varianceSeconds)}
                    </Badge>
                  )}
                </div>
              ) : eta?.limitation ? (
                <div className="text-xs text-ink-subtle">{eta.limitation}</div>
              ) : null}
            </div>
          );
        },
      },
      { header: 'Observações', accessorFn: (row) => row.notes ?? '—' },
      ...(canWrite
        ? [
            {
              id: 'actions',
              header: '',
              cell: ({ row }: { row: { index: number; original: TripDeliveryStopEntity } }) => {
                const stop = row.original;
                const nextStatuses = tripFinished ? [] : NEXT_STATUSES[stop.status];
                return (
                  <div className="flex items-center justify-end gap-1">
                    {planningAllowed && (
                      <>
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-muted hover:text-ink disabled:opacity-30"
                          disabled={row.index === 0 || reorderMutation.isPending}
                          onClick={() => move(row.index, -1)}
                          aria-label="Mover para cima"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-muted hover:text-ink disabled:opacity-30"
                          disabled={row.index === stops.length - 1 || reorderMutation.isPending}
                          onClick={() => move(row.index, 1)}
                          aria-label="Mover para baixo"
                        >
                          <ArrowDown size={14} />
                        </button>
                      </>
                    )}
                    <Dropdown
                      trigger={
                        <span className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-muted hover:text-ink">
                          <MoreHorizontal size={16} />
                        </span>
                      }
                      items={[
                        ...(planningAllowed
                          ? [{ label: 'Editar', icon: <Pencil size={14} />, onClick: () => setEditingStop(stop) }]
                          : []),
                        ...nextStatuses.map((status) => ({
                          label: `Marcar como ${TRIP_DELIVERY_STOP_STATUS_LABELS[status].toLowerCase()}`,
                          onClick: () => statusMutation.mutate({ stopId: stop.id, status }),
                        })),
                        ...(planningAllowed
                          ? [
                              {
                                label: 'Remover',
                                icon: <Trash2 size={14} />,
                                danger: true,
                                onClick: () => setRemovingStop(stop),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </div>
                );
              },
            } satisfies ColumnDef<TripDeliveryStopEntity, unknown>,
          ]
        : []),
    ],
    [canWrite, planningAllowed, tripFinished, stops.length, reorderMutation.isPending, etaByStopId],
  );

  const eta = etaQuery.data;

  return (
    <div>
      <div className="p-3">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-ink-subtle" />
            <p className="text-sm font-semibold text-ink">Previsão de chegada</p>
          </div>
          {etaQuery.isLoading ? (
            <p className="mt-2 text-sm text-ink-muted">Calculando previsão…</p>
          ) : eta ? (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-ink-muted">
                  Planejado: {eta.tripPlannedArrival ? formatDateTime(eta.tripPlannedArrival) : '—'}
                </span>
                <span className="text-ink">
                  Previsto (destino final): {eta.tripEstimatedArrival ? formatDateTime(eta.tripEstimatedArrival) : '—'}
                </span>
                {eta.tripDelayed !== null && eta.tripVarianceSeconds !== null && (
                  <Badge tone={eta.tripDelayed ? 'warning' : 'success'}>{formatVariance(eta.tripVarianceSeconds)}</Badge>
                )}
              </div>
              {eta.tripEstimatedArrivalBasis && <p className="text-xs text-ink-subtle">{eta.tripEstimatedArrivalBasis}</p>}
              {eta.limitations.map((limitation) => (
                <div
                  key={limitation}
                  className="flex items-start gap-2 rounded-md border border-warning-200 bg-warning-50 p-2.5 text-xs text-warning-700"
                >
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{limitation}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">Não foi possível calcular a previsão de chegada.</p>
          )}
        </Card>
      </div>

      <div className="p-3 pt-0">
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Route size={16} className="text-ink-subtle" />
              <p className="text-sm font-semibold text-ink">Roteirização</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              loading={suggestMutation.isPending}
              disabled={stops.length < 2}
              onClick={() => suggestMutation.mutate()}
            >
              Solicitar roteirização
            </Button>
          </div>

          {stops.length < 2 && (
            <p className="mt-2 text-sm text-ink-muted">
              Cadastre pelo menos duas paradas para calcular uma sugestão de sequência.
            </p>
          )}

          {suggestion && (
            <div className="mt-4 flex flex-col gap-3">
              {suggestion.limitations.map((limitation) => (
                <div
                  key={limitation}
                  className="flex items-start gap-2 rounded-md border border-warning-200 bg-warning-50 p-2.5 text-xs text-warning-700"
                >
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{limitation}</span>
                </div>
              ))}

              {suggestion.changed ? (
                <>
                  <div className="scrollbar-thin overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs font-medium text-ink-muted">
                          <th className="px-2 py-1.5">Atual</th>
                          <th className="px-2 py-1.5" />
                          <th className="px-2 py-1.5">Sugerida</th>
                          <th className="px-2 py-1.5">Cliente/local</th>
                          <th className="px-2 py-1.5">Previsão de chegada</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suggestion.items.map((item) => (
                          <tr key={item.stopId} className="border-b border-border last:border-0">
                            <td className="px-2 py-1.5 text-ink-muted">{item.currentSequence}</td>
                            <td className="px-2 py-1.5 text-ink-subtle">
                              {item.currentSequence !== item.suggestedSequence && <ArrowRight size={14} />}
                            </td>
                            <td className="px-2 py-1.5 font-medium text-ink">{item.suggestedSequence}</td>
                            <td className="px-2 py-1.5">
                              {item.customerName ?? '—'} · {item.locationName}
                            </td>
                            <td className="px-2 py-1.5 text-ink-muted">
                              {item.plannedArrival ? formatDateTime(item.plannedArrival) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {canWrite && (
                    <div>
                      <Button
                        size="sm"
                        loading={applyMutation.isPending}
                        disabled={!planningAllowed}
                        onClick={() => applyMutation.mutate()}
                      >
                        <Check size={14} />
                        Aplicar sugestão
                      </Button>
                      {!planningAllowed && (
                        <p className="mt-1.5 text-xs text-ink-muted">
                          A viagem já partiu — a sequência de planejamento não pode mais ser alterada.
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-ink-muted">A sequência sugerida é igual à sequência atual.</p>
              )}
            </div>
          )}
        </Card>
      </div>

      {canWrite && planningAllowed && (
        <div className="flex justify-end p-3 pt-0">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            Adicionar parada
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        data={stops}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        getRowId={(s) => s.id}
        emptyTitle="Nenhuma parada/entrega planejada nesta viagem"
        emptyDescription="Adicione as paradas de entrega e defina a ordem em que devem ser cumpridas."
      />

      <DeliveryStopModal open={createOpen} onClose={() => setCreateOpen(false)} tripId={tripId} />
      <DeliveryStopModal
        open={Boolean(editingStop)}
        onClose={() => setEditingStop(null)}
        tripId={tripId}
        stop={editingStop}
      />
      <ConfirmDialog
        open={Boolean(removingStop)}
        onClose={() => setRemovingStop(null)}
        onConfirm={() => removingStop && removeMutation.mutate(removingStop.id)}
        title="Remover parada"
        description="Tem certeza que deseja remover esta parada/entrega? As demais serão renumeradas."
        confirmLabel="Remover"
        danger
        loading={removeMutation.isPending}
      />
    </div>
  );
}
