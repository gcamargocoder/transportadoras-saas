'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Card } from '../../../components/ui/card';
import { DataTable } from '../../../components/ui/data-table';
import { CHECKLIST_STATUS_LABELS, CHECKLIST_STATUS_TONE } from '../../checklists/status';
import { listChecklistExecutions } from '../../../lib/api/checklist.api';
import { listFuelSupplies } from '../../../lib/api/fuel.api';
import { listAxleEvents, listTripLocations, listTripStops } from '../../../lib/api/trip-operations.api';
import {
  AXLE_EVENT_SOURCE_LABELS,
  FUEL_TYPE_LABELS,
  SYNC_STATUS_LABELS,
  TRIP_STOP_TYPE_LABELS,
} from '../../../lib/labels';
import type { AxleEventEntity, ChecklistExecutionEntity, FuelSupplyEntity, TripStopEntity } from '../../../types/entities';
import { formatCurrency, formatDateTime, formatNumber } from '../../../utils/format';
import { SYNC_STATUS_TONE, TRIP_STOP_TYPE_TONE } from '../operation-status';

// Fase 66 -- FuelSupply.tripId e ChecklistExecution.tripId ja existiam
// (Fases 25/38), so nunca tinham visibilidade na tela da viagem -- somente
// leitura aqui, reaproveitando os endpoints administrativos ja existentes
// (?tripId=), sem sub-recurso novo em TripsController.

// Fase 25 -- visibilidade administrativa (somente leitura) do que o app do
// motorista registrou: ultima posicao, paradas e excecoes de eixo. Sem
// mapa nesta fase (ver secao 20 da fase); so tabelas/cards, reaproveitando
// os componentes de UI ja usados nas outras abas de viagem.
export function OperacaoTab({ tripId }: { tripId: string }): JSX.Element {
  const router = useRouter();
  const locationsQuery = useQuery({
    queryKey: ['trip-locations', tripId],
    queryFn: () => listTripLocations(tripId),
  });
  const stopsQuery = useQuery({
    queryKey: ['trip-stops', tripId],
    queryFn: () => listTripStops(tripId),
  });
  const axleEventsQuery = useQuery({
    queryKey: ['trip-axle-events', tripId],
    queryFn: () => listAxleEvents(tripId),
  });
  const fuelSuppliesQuery = useQuery({
    queryKey: ['trip-fuel-supplies', tripId],
    queryFn: () => listFuelSupplies({ tripId, pageSize: 50 }),
  });
  const checklistsQuery = useQuery({
    queryKey: ['trip-checklists', tripId],
    queryFn: () => listChecklistExecutions({ tripId, pageSize: 50 }),
  });

  const lastLocation = locationsQuery.data?.[0] ?? null;

  const stopColumns = useMemo<ColumnDef<TripStopEntity, unknown>[]>(
    () => [
      {
        header: 'Tipo',
        cell: ({ row }) => (
          <Badge tone={TRIP_STOP_TYPE_TONE[row.original.type]}>
            {TRIP_STOP_TYPE_LABELS[row.original.type]}
          </Badge>
        ),
      },
      { header: 'Início', cell: ({ row }) => formatDateTime(row.original.startedAt) },
      {
        header: 'Duração',
        cell: ({ row }) =>
          row.original.durationMinutes !== null
            ? `${formatNumber(row.original.durationMinutes)} min`
            : 'Em andamento',
      },
      { header: 'Local', cell: ({ row }) => row.original.locationLabel ?? '-' },
      {
        header: 'Sincronização',
        cell: ({ row }) => (
          <Badge tone={SYNC_STATUS_TONE[row.original.syncStatus]}>
            {SYNC_STATUS_LABELS[row.original.syncStatus]}
          </Badge>
        ),
      },
    ],
    [],
  );

  const axleColumns = useMemo<ColumnDef<AxleEventEntity, unknown>[]>(
    () => [
      { header: 'Praça', cell: ({ row }) => row.original.tollPlazaName ?? 'Não identificada' },
      {
        header: 'Padrão',
        cell: ({ row }) => `${row.original.defaultAxles} eixos`,
      },
      {
        header: 'Tarifado',
        cell: ({ row }) => (
          <Badge tone={row.original.suspendedAxles > 0 ? 'warning' : 'success'}>
            {row.original.declaredAxles} eixos
            {row.original.suspendedAxles > 0 ? ` (-${row.original.suspendedAxles})` : ''}
          </Badge>
        ),
      },
      { header: 'Origem', cell: ({ row }) => AXLE_EVENT_SOURCE_LABELS[row.original.source] },
      { header: 'Início', cell: ({ row }) => formatDateTime(row.original.startedAt) },
      {
        header: 'Sincronização',
        cell: ({ row }) => (
          <Badge tone={SYNC_STATUS_TONE[row.original.syncStatus]}>
            {SYNC_STATUS_LABELS[row.original.syncStatus]}
          </Badge>
        ),
      },
    ],
    [],
  );

  const fuelColumns = useMemo<ColumnDef<FuelSupplyEntity, unknown>[]>(
    () => [
      { header: 'Data', cell: ({ row }) => formatDateTime(row.original.supplyDate) },
      { header: 'Posto', accessorFn: (row) => row.fuelStationName ?? '-' },
      { header: 'Combustível', accessorFn: (row) => FUEL_TYPE_LABELS[row.fuelType] },
      { header: 'Litros', cell: ({ row }) => `${formatNumber(row.original.liters, 1)} L` },
      { header: 'Valor', cell: ({ row }) => formatCurrency(row.original.totalAmount) },
      { header: 'Odômetro', cell: ({ row }) => `${formatNumber(row.original.odometerKm)} km` },
    ],
    [],
  );

  const checklistColumns = useMemo<ColumnDef<ChecklistExecutionEntity, unknown>[]>(
    () => [
      { header: 'Início', cell: ({ row }) => formatDateTime(row.original.startedAt) },
      {
        header: 'Conclusão',
        cell: ({ row }) => (row.original.completedAt ? formatDateTime(row.original.completedAt) : '-'),
      },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={CHECKLIST_STATUS_TONE[row.original.status]}>
            {CHECKLIST_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      {
        header: 'Não conformidade crítica',
        cell: ({ row }) => (
          <Badge tone={row.original.hasCriticalNonConformity ? 'danger' : 'success'}>
            {row.original.hasCriticalNonConformity ? 'Sim' : 'Não'}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold text-ink">Última posição</h3>
        {locationsQuery.isLoading ? (
          <p className="text-sm text-ink-muted">Carregando...</p>
        ) : lastLocation ? (
          <p className="text-sm text-ink-muted">
            Lat {lastLocation.latitude.toFixed(6)}, Lng {lastLocation.longitude.toFixed(6)} ·
            atualizado em {formatDateTime(lastLocation.recordedAt)}
          </p>
        ) : (
          <p className="text-sm text-ink-muted">Nenhuma posição registrada ainda.</p>
        )}
      </Card>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Paradas</h3>
        <DataTable
          columns={stopColumns}
          data={stopsQuery.data ?? []}
          isLoading={stopsQuery.isLoading}
          isError={stopsQuery.isError}
          onRetry={() => stopsQuery.refetch()}
          getRowId={(s) => s.id}
          emptyTitle="Nenhuma parada registrada nesta viagem"
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Exceções de eixo</h3>
        <DataTable
          columns={axleColumns}
          data={axleEventsQuery.data ?? []}
          isLoading={axleEventsQuery.isLoading}
          isError={axleEventsQuery.isError}
          onRetry={() => axleEventsQuery.refetch()}
          getRowId={(e) => e.id}
          emptyTitle="Nenhuma exceção de eixo registrada nesta viagem"
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Abastecimentos</h3>
        <DataTable
          columns={fuelColumns}
          data={fuelSuppliesQuery.data?.items ?? []}
          isLoading={fuelSuppliesQuery.isLoading}
          isError={fuelSuppliesQuery.isError}
          onRetry={() => fuelSuppliesQuery.refetch()}
          getRowId={(s) => s.id}
          emptyTitle="Nenhum abastecimento registrado nesta viagem"
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Checklists</h3>
        <DataTable
          columns={checklistColumns}
          data={checklistsQuery.data?.items ?? []}
          isLoading={checklistsQuery.isLoading}
          isError={checklistsQuery.isError}
          onRetry={() => checklistsQuery.refetch()}
          getRowId={(c) => c.id}
          onRowClick={(c) => router.push(`/checklists/${c.id}`)}
          emptyTitle="Nenhum checklist registrado nesta viagem"
        />
      </div>
    </div>
  );
}
