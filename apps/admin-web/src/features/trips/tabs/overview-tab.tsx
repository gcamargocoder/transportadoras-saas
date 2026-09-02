'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Badge } from '../../../components/ui/badge';
import { Card, CardBody, CardHeader } from '../../../components/ui/card';
import { EntitySelect } from '../../../components/ui/entity-select';
import { ErrorState } from '../../../components/ui/error-state';
import { LoadingState } from '../../../components/ui/loading-state';
import { Select } from '../../../components/ui/select';
import { useToast } from '../../../components/ui/toast';
import { useAuth } from '../../../hooks/use-auth';
import { toFriendlyMessage } from '../../../lib/api/errors';
import {
  getTripMetrics,
  getTripReturnConsolidation,
  getTripSummary,
  updateTrip,
  updateTripStatus,
} from '../../../lib/api/trips.api';
import { listTollRoutes } from '../../../lib/api/toll-routes.api';
import { TRIP_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import { CHECKLIST_STATUS_LABELS, CHECKLIST_STATUS_TONE } from '../../checklists/status';
import { TRIP_STATUS_OPTIONS } from '../status';
import { TRIP_LOAD_STATUS_LABELS, TRIP_STATUS_LABELS } from '../../../lib/labels';
import type { TripEntity } from '../../../types/entities';
import { TripStatus } from '../../../types/enums';
import { formatCurrency, formatDateTime, formatNumber } from '../../../utils/format';

export function OverviewTab({ trip }: { trip: TripEntity }): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const summaryQuery = useQuery({
    queryKey: ['trips', trip.id, 'summary'],
    queryFn: () => getTripSummary(trip.id),
  });
  const metricsQuery = useQuery({
    queryKey: ['trips', trip.id, 'metrics'],
    queryFn: () => getTripMetrics(trip.id),
  });
  // Fase E -- consolidacao DERIVADA ida + retorno (somente leitura). O card
  // so aparece quando ha retornos vinculados OU quando esta viagem e, ela
  // propria, o retorno de outra (previousTripId). Uma consulta por pagina de
  // detalhe -- nunca em lista.
  const consolidationQuery = useQuery({
    queryKey: ['trips', trip.id, 'return-consolidation'],
    queryFn: () => getTripReturnConsolidation(trip.id),
  });
  const consolidation = consolidationQuery.data;
  const showConsolidation =
    !!consolidation && (consolidation.returns.length > 0 || !!consolidation.outbound.previousTripId);

  const statusMutation = useMutation({
    mutationFn: (status: TripStatus) => updateTripStatus(trip.id, status),
    onSuccess: () => {
      toast.success('Status da viagem atualizado.');
      queryClient.invalidateQueries({ queryKey: ['trips', trip.id] });
      queryClient.invalidateQueries({ queryKey: ['trips', trip.id, 'summary'] });
    },
    onError: (error) =>
      toast.error('Não foi possível atualizar o status.', toFriendlyMessage(error)),
  });

  const tollRouteMutation = useMutation({
    mutationFn: (tollRouteId: string | null) => updateTrip(trip.id, { tollRouteId }),
    onSuccess: () => {
      toast.success('Rota de pedágio atualizada.');
      queryClient.invalidateQueries({ queryKey: ['trips', trip.id] });
      queryClient.invalidateQueries({ queryKey: ['trips', trip.id, 'toll-reconciliation'] });
    },
    onError: (error) =>
      toast.error('Não foi possível atualizar a rota de pedágio.', toFriendlyMessage(error)),
  });

  const canWrite = hasRole(user?.role, TRIP_WRITE_ROLES);
  // Mesma regra do backend: so e possivel editar o planejamento (inclusive
  // a rota de pedagio) enquanto a viagem esta em PLANNED.
  const canEditRoute = canWrite && trip.status === TripStatus.PLANNED;

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card>
        <CardHeader
          title="Dados da viagem"
          action={
            canWrite && (
              <Select
                value={trip.status}
                onChange={(e) => statusMutation.mutate(e.target.value as TripStatus)}
                disabled={statusMutation.isPending}
                className="w-48"
              >
                {TRIP_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {TRIP_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            )
          }
        />
        <CardBody>
          {/* Fase D -- vinculo EXPLICITO ida -> retorno. So aparece quando o
              operador de fato informou previousTripId; nunca inferido. */}
          {trip.previousTrip && (
            <Link
              href={`/trips/${trip.previousTrip.id}`}
              className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:underline"
            >
              ↩ Retorno da viagem {trip.previousTrip.originName} → {trip.previousTrip.destinationName}
            </Link>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Cliente" value={trip.customerName ?? '-'} />
            <Field label="Motorista" value={trip.driverName ?? '-'} />
            <Field label="Veículo" value={trip.vehiclePlate ?? '-'} />
            <Field label="Saída prevista" value={formatDateTime(trip.plannedDeparture)} />
            <Field label="Chegada prevista" value={formatDateTime(trip.plannedArrival)} />
            <Field label="Saída real" value={formatDateTime(trip.actualDeparture)} />
            <Field label="Chegada real" value={formatDateTime(trip.actualArrival)} />
            <Field
              label="Carga (real, na largada)"
              value={trip.loadStatus ? TRIP_LOAD_STATUS_LABELS[trip.loadStatus] : '-'}
            />
            <Field
              label="Carga planejada"
              value={trip.plannedLoadStatus ? TRIP_LOAD_STATUS_LABELS[trip.plannedLoadStatus] : '-'}
            />
            <Field
              label="KM inicial"
              value={trip.initialOdometerKm !== null ? `${formatNumber(trip.initialOdometerKm)} km` : '-'}
            />
            <Field
              label="KM atual"
              value={trip.currentOdometerKm !== null ? `${formatNumber(trip.currentOdometerKm)} km` : '-'}
            />
            <Field
              label="Eixos padrão"
              value={trip.defaultAxles !== null ? String(trip.defaultAxles) : '-'}
            />
            {trip.status === TripStatus.PAUSED && (
              <Field label="Pausada desde" value={formatDateTime(trip.updatedAt)} />
            )}
          </div>

          <div className="mt-4">
            <p className="text-xs text-ink-subtle">Rota de pedágio</p>
            {canEditRoute ? (
              <div className="mt-1 max-w-sm">
                <EntitySelect
                  id="tollRouteId"
                  queryKey={['toll-routes', 'select']}
                  queryFn={() => listTollRoutes({ pageSize: 100, isActive: true })}
                  getOptionValue={(r) => r.id}
                  getOptionLabel={(r) => `${r.name} (${r.originLabel} → ${r.destinationLabel})`}
                  value={trip.tollRouteId ?? ''}
                  onChange={(value) => tollRouteMutation.mutate(value || null)}
                  disabled={tollRouteMutation.isPending}
                  placeholder="Nenhuma"
                />
              </div>
            ) : (
              <p className="mt-0.5 text-sm font-medium text-ink">{trip.tollRouteName ?? '-'}</p>
            )}
          </div>

          {trip.notes && <p className="mt-4 text-sm text-ink-muted">{trip.notes}</p>}
        </CardBody>
      </Card>

      {/* Fase E -- resumo "Operação ida + retorno" (derivado, somente leitura;
          nunca altera dado, financeiro por perna = /financial-result). */}
      {showConsolidation && consolidation && (
        <Card>
          <CardHeader title="Operação ida + retorno" />
          <CardBody>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Pernas" value={`${consolidation.legCount} (1 ida + ${consolidation.returnLegCount} retorno(s))`} />
              <Field
                label="Distância concluída"
                value={
                  consolidation.totalCompletedDistanceKm !== null
                    ? `${formatNumber(consolidation.totalCompletedDistanceKm, 1)} km`
                    : '—'
                }
              />
              <Field label="Custo total" value={formatCurrency(consolidation.totalCost)} />
              <Field
                label="Receita contratada"
                value={
                  consolidation.totalContractedRevenue !== null
                    ? formatCurrency(consolidation.totalContractedRevenue)
                    : '—'
                }
              />
              <Field label="Receita faturada" value={formatCurrency(consolidation.totalInvoicedRevenue)} />
              <Field label="Receita recebida" value={formatCurrency(consolidation.totalReceivedRevenue)} />
              <Field
                label="Resultado operacional"
                value={
                  consolidation.consolidatedOperatingResult !== null
                    ? formatCurrency(consolidation.consolidatedOperatingResult)
                    : '—'
                }
              />
              <Field label="Resultado faturado" value={formatCurrency(consolidation.consolidatedInvoicedResult)} />
            </div>

            {!consolidation.revenueComplete && (
              <p className="mt-3 text-xs text-warning-700">
                Resultado operacional parcial: apenas {consolidation.legsWithContractedRevenue} de{' '}
                {consolidation.legCount} pernas têm receita contratada. O custo é o total; a receita, só das pernas com valor comercial.
              </p>
            )}

            <div className="mt-4 flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
              {[consolidation.outbound, ...consolidation.returns].map((leg) => (
                <div key={leg.tripId} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={leg.role === 'OUTBOUND' ? 'brand' : 'neutral'}>
                        {leg.role === 'OUTBOUND' ? 'Ida' : 'Retorno'}
                      </Badge>
                      <Link href={`/trips/${leg.tripId}`} className="text-sm font-medium text-brand-600 hover:underline">
                        {leg.originName} → {leg.destinationName}
                      </Link>
                      <span className="text-xs text-ink-subtle">{TRIP_STATUS_LABELS[leg.status]}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      Carga real:{' '}
                      {leg.loadCondition === 'UNKNOWN'
                        ? 'não informada'
                        : TRIP_LOAD_STATUS_LABELS[leg.loadCondition]}
                      {leg.plannedLoadStatus &&
                        ` · Planejado: ${TRIP_LOAD_STATUS_LABELS[leg.plannedLoadStatus]}`}
                    </p>
                  </div>
                  <div className="text-right text-xs text-ink-subtle">
                    <p>Custo: {formatCurrency(leg.financialResult.totalCost)}</p>
                    <p>
                      Resultado:{' '}
                      {leg.financialResult.operatingResult !== null
                        ? formatCurrency(leg.financialResult.operatingResult)
                        : '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {summaryQuery.isLoading && <LoadingState label="Carregando resumo" />}
      {summaryQuery.isError && <ErrorState onRetry={() => summaryQuery.refetch()} />}

      {/* Fase 112 -- resumo de prontidao do planejamento, so faz sentido
          antes da partida real (depois disso a viagem ja esta em execucao). */}
      {summaryQuery.data && !trip.actualDeparture && (
        <Card>
          <CardHeader title="Prontidão do planejamento" />
          <CardBody>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={summaryQuery.data.readyToStart ? 'success' : 'warning'}>
                {summaryQuery.data.readyToStart ? 'Pronta para iniciar' : 'Pendências para iniciar'}
              </Badge>
              <Badge tone={summaryQuery.data.hasComposition ? 'success' : 'neutral'}>
                {summaryQuery.data.hasComposition ? 'Composição definida' : 'Sem composição'}
              </Badge>
              <Badge tone={summaryQuery.data.routePlanComputed ? 'success' : 'neutral'}>
                {summaryQuery.data.routePlanComputed ? 'Rota calculada' : 'Rota não calculada'}
              </Badge>
              <Badge tone={summaryQuery.data.plannedMetricsSynced ? 'success' : 'neutral'}>
                {summaryQuery.data.plannedMetricsSynced ? 'Métricas previstas preenchidas' : 'Métricas previstas pendentes'}
              </Badge>
              {summaryQuery.data.preTripChecklistRequired && (
                <Badge
                  tone={
                    summaryQuery.data.preTripChecklistStatus
                      ? CHECKLIST_STATUS_TONE[summaryQuery.data.preTripChecklistStatus]
                      : 'warning'
                  }
                >
                  Checklist pré-viagem:{' '}
                  {summaryQuery.data.preTripChecklistStatus
                    ? CHECKLIST_STATUS_LABELS[summaryQuery.data.preTripChecklistStatus]
                    : 'Não iniciado'}
                </Badge>
              )}
              {summaryQuery.data.withinCapacity !== null && (
                <Badge tone={summaryQuery.data.withinCapacity ? 'success' : 'danger'}>
                  {summaryQuery.data.withinCapacity ? 'Dentro da capacidade' : 'Acima da capacidade do veículo'}
                </Badge>
              )}
            </div>
            {!summaryQuery.data.readyToStart && summaryQuery.data.notReadyReason && (
              <p className="mt-3 text-sm text-warning-700">{summaryQuery.data.notReadyReason}</p>
            )}
            {summaryQuery.data.plannedWeightKg !== null && (
              <p className="mt-3 text-sm text-ink-muted">
                Peso previsto da carga: {formatNumber(summaryQuery.data.plannedWeightKg)} kg
                {summaryQuery.data.vehicleCapacityKg !== null &&
                  ` · Capacidade do veículo: ${formatNumber(summaryQuery.data.vehicleCapacityKg)} kg`}
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {/* Fase 116 -- consolidacao do fechamento: so faz sentido depois que a
          viagem de fato partiu (espelha a condicao inversa do card de
          planejamento acima). Nunca bloqueia a conclusao da viagem -- so
          informa o que ainda esta em aberto. */}
      {summaryQuery.data && trip.actualDeparture && (
        <Card>
          <CardHeader title="Consolidação do encerramento" />
          <CardBody>
            <div className="flex flex-wrap items-center gap-2">
              {summaryQuery.data.deliverySummary.totalCount === 0 ? (
                <Badge tone="neutral">Sem entregas planejadas</Badge>
              ) : (
                <>
                  <Badge tone="success">{summaryQuery.data.deliverySummary.completedCount} concluída(s)</Badge>
                  {summaryQuery.data.deliverySummary.pendingCount + summaryQuery.data.deliverySummary.inProgressCount > 0 && (
                    <Badge tone="warning">
                      {summaryQuery.data.deliverySummary.pendingCount + summaryQuery.data.deliverySummary.inProgressCount} pendente(s)
                    </Badge>
                  )}
                  {summaryQuery.data.deliverySummary.failedCount > 0 && (
                    <Badge tone="danger">{summaryQuery.data.deliverySummary.failedCount} falha(s)</Badge>
                  )}
                </>
              )}
              {summaryQuery.data.openOccurrencesCount === 0 ? (
                <Badge tone="success">Sem ocorrências em aberto</Badge>
              ) : (
                <>
                  {summaryQuery.data.criticalOpenOccurrencesCount > 0 && (
                    <Badge tone="danger">{summaryQuery.data.criticalOpenOccurrencesCount} crítica(s) em aberto</Badge>
                  )}
                  <Badge tone="warning">{summaryQuery.data.openOccurrencesCount} ocorrência(s) em aberto</Badge>
                </>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {summaryQuery.data && (
        <Card>
          <CardHeader title="Resumo consolidado" />
          <CardBody>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field
                label="Distância"
                value={
                  summaryQuery.data.distanceKm
                    ? `${formatNumber(summaryQuery.data.distanceKm)} km`
                    : '-'
                }
              />
              <Field
                label="Duração"
                value={
                  summaryQuery.data.durationMinutes
                    ? `${formatNumber(summaryQuery.data.durationMinutes)} min`
                    : '-'
                }
              />
              <Field
                label="Pedágios"
                value={`${summaryQuery.data.tollTransactionsCount} · ${formatCurrency(summaryQuery.data.tollTransactionsTotal)}`}
              />
              <Field
                label="Custo total (real/previsto)"
                value={`${formatCurrency(summaryQuery.data.actualTotalCost)} / ${formatCurrency(summaryQuery.data.plannedTotalCost)}`}
              />
            </div>
          </CardBody>
        </Card>
      )}

      {metricsQuery.data && (
        <Card>
          <CardHeader title="Métricas planejadas x executadas" />
          <CardBody>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field
                label="Distância planejada"
                value={
                  metricsQuery.data.plannedDistanceKm
                    ? `${formatNumber(metricsQuery.data.plannedDistanceKm)} km`
                    : '-'
                }
              />
              <Field
                label="Distância executada"
                value={
                  metricsQuery.data.actualDistanceKm
                    ? `${formatNumber(metricsQuery.data.actualDistanceKm)} km`
                    : '-'
                }
              />
              <Field
                label="Combustível planejado"
                value={
                  metricsQuery.data.plannedFuelLiters
                    ? `${formatNumber(metricsQuery.data.plannedFuelLiters, 1)} L`
                    : '-'
                }
              />
              <Field
                label="Combustível executado"
                value={
                  metricsQuery.data.actualFuelLiters
                    ? `${formatNumber(metricsQuery.data.actualFuelLiters, 1)} L`
                    : '-'
                }
              />
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <p className="text-xs text-ink-subtle">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}
