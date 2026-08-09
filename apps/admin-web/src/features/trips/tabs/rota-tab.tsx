'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { DataTable } from '../../../components/ui/data-table';
import { toFriendlyMessage } from '../../../lib/api/errors';
import {
  computeRoutePlan,
  computeRoutePlanAlternatives,
  getRoutePlan,
  getRoutePlanTolls,
  recalculateRoutePlan,
  selectRoutePlan,
} from '../../../lib/api/route-plan.api';
import { getTripRouteEvents } from '../../../lib/api/trips.api';
import { ROUTE_TOLL_ESTIMATE_SOURCE_LABELS, TOLL_MATCH_STATUS_LABELS } from '../../../lib/labels';
import type { RoutePlanEntity, RoutePlanTollEntity } from '../../../types/entities';
import { formatCurrency, formatNumber } from '../../../utils/format';
import { useToast } from '../../../components/ui/toast';
import { ROUTE_TOLL_ESTIMATE_SOURCE_TONE, TOLL_MATCH_STATUS_TONE } from '../route-plan-status';

function formatKm(meters: number): string {
  return `${formatNumber(meters / 1000, 1)} km`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return `${hours}h${minutes.toString().padStart(2, '0')}`;
}

function RoutePlanSummary({ routePlan }: { routePlan: RoutePlanEntity }): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div>
        <p className="text-xs text-ink-muted">Distância</p>
        <p className="text-sm font-semibold text-ink">{formatKm(routePlan.distanceMeters)}</p>
      </div>
      <div>
        <p className="text-xs text-ink-muted">Duração estimada</p>
        <p className="text-sm font-semibold text-ink">{formatDuration(routePlan.durationSeconds)}</p>
      </div>
      <div>
        <p className="text-xs text-ink-muted">Pedágios previstos</p>
        <p className="text-sm font-semibold text-ink">{routePlan.tolls.length}</p>
      </div>
      <div>
        <p className="text-xs text-ink-muted">Custo estimado</p>
        <p className="text-sm font-semibold text-ink">
          {routePlan.totalTollAmount !== null ? formatCurrency(routePlan.totalTollAmount) : '—'}
        </p>
      </div>
    </div>
  );
}

export function RotaTab({ tripId }: { tripId: string }): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [alternatives, setAlternatives] = useState<RoutePlanEntity[] | null>(null);

  const routePlanQuery = useQuery({
    queryKey: ['route-plan', tripId],
    queryFn: () => getRoutePlan(tripId),
  });
  const tollsQuery = useQuery({
    queryKey: ['route-plan-tolls', tripId],
    queryFn: () => getRoutePlanTolls(tripId),
    enabled: Boolean(routePlanQuery.data),
  });
  // Reaproveita o endpoint ja existente de eventos de rota (Fase 23) -- nao
  // cria um novo endpoint so para saber se ha um desvio em aberto.
  const routeEventsQuery = useQuery({
    queryKey: ['route-events', tripId],
    queryFn: () => getTripRouteEvents(tripId),
  });
  const hasUnresolvedDeviation = (routeEventsQuery.data ?? []).some(
    (event) => event.type === 'DEVIATION' && !event.resolvedAt,
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['route-plan', tripId] });
    void queryClient.invalidateQueries({ queryKey: ['route-plan-tolls', tripId] });
    void queryClient.invalidateQueries({ queryKey: ['route-events', tripId] });
  };

  const computeMutation = useMutation({
    mutationFn: () => computeRoutePlan(tripId),
    onSuccess: () => {
      toast.success('Rota calculada com sucesso.');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível calcular a rota.', toFriendlyMessage(error)),
  });

  const alternativesMutation = useMutation({
    mutationFn: () => computeRoutePlanAlternatives(tripId),
    onSuccess: (routes) => setAlternatives(routes),
    onError: (error) => toast.error('Não foi possível calcular alternativas.', toFriendlyMessage(error)),
  });

  const selectMutation = useMutation({
    mutationFn: (routePlanId: string) => selectRoutePlan(tripId, routePlanId),
    onSuccess: () => {
      toast.success('Rota selecionada.');
      setAlternatives(null);
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível selecionar a rota.', toFriendlyMessage(error)),
  });

  const recalculateMutation = useMutation({
    mutationFn: () => recalculateRoutePlan(tripId),
    onSuccess: () => {
      toast.success('Rota recalculada.');
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível recalcular a rota.', toFriendlyMessage(error)),
  });

  const tollColumns = useMemo<ColumnDef<RoutePlanTollEntity, unknown>[]>(
    () => [
      { header: '#', accessorFn: (row) => row.sequence },
      { header: 'Praça', accessorFn: (row) => row.name },
      { header: 'Distância da origem', cell: ({ row }) => formatKm(row.original.distanceFromOriginMeters) },
      {
        header: 'Estimado',
        cell: ({ row }) =>
          row.original.estimatedAmount !== null ? formatCurrency(row.original.estimatedAmount) : '—',
      },
      {
        header: 'Correspondência',
        cell: ({ row }) => (
          <Badge tone={TOLL_MATCH_STATUS_TONE[row.original.matchStatus]}>
            {TOLL_MATCH_STATUS_LABELS[row.original.matchStatus]}
          </Badge>
        ),
      },
    ],
    [],
  );

  if (routePlanQuery.isLoading) {
    return <p className="p-4 text-sm text-ink-muted">Carregando rota planejada...</p>;
  }

  const routePlan = routePlanQuery.data ?? null;
  const comparison = recalculateMutation.data;

  return (
    <div className="flex flex-col gap-4 p-4">
      {hasUnresolvedDeviation && (
        <Card className="border-warning-200 bg-warning-50 p-4">
          <p className="text-sm font-semibold text-warning-700">Desvio de rota detectado</p>
          <p className="mt-1 text-sm text-warning-700">
            O veículo está fora da rota planejada há algum tempo. Recalcule a rota a partir da
            posição atual.
          </p>
          <div className="mt-3">
            <Button size="sm" loading={recalculateMutation.isPending} onClick={() => recalculateMutation.mutate()}>
              Recalcular rota
            </Button>
          </div>
        </Card>
      )}

      {comparison && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Resultado do recálculo</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {comparison.previous && (
              <div>
                <p className="text-xs font-medium uppercase text-ink-muted">Rota original</p>
                <RoutePlanSummary routePlan={comparison.previous} />
              </div>
            )}
            <div>
              <p className="text-xs font-medium uppercase text-ink-muted">Nova rota</p>
              <RoutePlanSummary routePlan={comparison.next} />
            </div>
          </div>
          {comparison.difference && (
            <p className="mt-3 text-sm text-ink-muted">
              Diferença: {comparison.difference.distanceMetersDiff >= 0 ? '+' : ''}
              {formatKm(comparison.difference.distanceMetersDiff)} ·{' '}
              {comparison.difference.durationSecondsDiff >= 0 ? '+' : ''}
              {formatDuration(Math.abs(comparison.difference.durationSecondsDiff))} ·{' '}
              {comparison.difference.tollCountDiff >= 0 ? '+' : ''}
              {comparison.difference.tollCountDiff} pedágio(s)
              {comparison.difference.totalTollAmountDiff !== null && (
                <>
                  {' '}
                  ·{' '}
                  {comparison.difference.totalTollAmountDiff >= 0 ? '+' : ''}
                  {formatCurrency(comparison.difference.totalTollAmountDiff)}
                </>
              )}
            </p>
          )}
        </Card>
      )}

      {!routePlan ? (
        <Card className="p-4">
          <p className="text-sm text-ink-muted">Esta viagem ainda não tem uma rota planejada.</p>
          <div className="mt-3">
            <Button loading={computeMutation.isPending} onClick={() => computeMutation.mutate()}>
              Calcular rota
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">
                {routePlan.originLabel} → {routePlan.destinationLabel}
              </p>
              <Badge tone={ROUTE_TOLL_ESTIMATE_SOURCE_TONE[routePlan.tollEstimateSource]} className="mt-1">
                {ROUTE_TOLL_ESTIMATE_SOURCE_LABELS[routePlan.tollEstimateSource]}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" loading={alternativesMutation.isPending} onClick={() => alternativesMutation.mutate()}>
                Ver alternativas
              </Button>
              <Button size="sm" variant="secondary" loading={recalculateMutation.isPending} onClick={() => recalculateMutation.mutate()}>
                Recalcular rota
              </Button>
            </div>
          </div>
          <RoutePlanSummary routePlan={routePlan} />
        </Card>
      )}

      {alternatives && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Alternativas de rota</h3>
          <div className="flex flex-col gap-3">
            {alternatives.map((alt, index) => (
              <div key={alt.id} className="rounded-md border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">Rota {index + 1}{alt.isCurrent ? ' (atual)' : ''}</p>
                  {!alt.isCurrent && (
                    <Button size="sm" loading={selectMutation.isPending} onClick={() => selectMutation.mutate(alt.id)}>
                      Selecionar esta rota
                    </Button>
                  )}
                </div>
                <RoutePlanSummary routePlan={alt} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {routePlan && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Pedágios previstos</h3>
          <DataTable
            columns={tollColumns}
            data={tollsQuery.data ?? []}
            isLoading={tollsQuery.isLoading}
            isError={tollsQuery.isError}
            onRetry={() => tollsQuery.refetch()}
            getRowId={(t) => t.id}
            emptyTitle="Nenhum pedágio previsto para esta rota"
          />
        </div>
      )}
    </div>
  );
}
