'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardBody, CardHeader } from '../../../components/ui/card';
import { ErrorState } from '../../../components/ui/error-state';
import { LoadingState } from '../../../components/ui/loading-state';
import { Select } from '../../../components/ui/select';
import { useToast } from '../../../components/ui/toast';
import { useAuth } from '../../../hooks/use-auth';
import { toFriendlyMessage } from '../../../lib/api/errors';
import { getTripMetrics, getTripSummary, updateTripStatus } from '../../../lib/api/trips.api';
import { TRIP_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import { TRIP_STATUS_OPTIONS } from '../status';
import { TRIP_STATUS_LABELS } from '../../../lib/labels';
import type { TripEntity } from '../../../types/entities';
import type { TripStatus } from '../../../types/enums';
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

  const canWrite = hasRole(user?.role, TRIP_WRITE_ROLES);

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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Cliente" value={trip.customerName ?? '-'} />
            <Field label="Motorista" value={trip.driverName ?? '-'} />
            <Field label="Veículo" value={trip.vehiclePlate ?? '-'} />
            <Field label="Saída prevista" value={formatDateTime(trip.plannedDeparture)} />
            <Field label="Chegada prevista" value={formatDateTime(trip.plannedArrival)} />
            <Field label="Saída real" value={formatDateTime(trip.actualDeparture)} />
            <Field label="Chegada real" value={formatDateTime(trip.actualArrival)} />
          </div>
          {trip.notes && <p className="mt-4 text-sm text-ink-muted">{trip.notes}</p>}
        </CardBody>
      </Card>

      {summaryQuery.isLoading && <LoadingState label="Carregando resumo" />}
      {summaryQuery.isError && <ErrorState onRetry={() => summaryQuery.refetch()} />}
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
