'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Clock, Hourglass, ParkingSquare, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Card, CardHeader } from '../../../../../components/ui/card';
import { DataTable } from '../../../../../components/ui/data-table';
import { EntitySelect } from '../../../../../components/ui/entity-select';
import { ErrorState } from '../../../../../components/ui/error-state';
import { FilterBar } from '../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../components/ui/form-field';
import { Modal } from '../../../../../components/ui/modal';
import { PageHeader } from '../../../../../components/ui/page-header';
import { Pagination } from '../../../../../components/ui/pagination';
import { Select } from '../../../../../components/ui/select';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { useAuth } from '../../../../../hooks/use-auth';
import { MonthlyChartCard } from '../../../../../features/dashboard/monthly-chart-card';
import { BarRankingChart } from '../../../../../features/fleet-operations/bar-ranking-chart';
import { FleetFilters } from '../../../../../features/fleet-operations/fleet-filters';
import { useFleetOperationsFilters } from '../../../../../features/fleet-operations/use-fleet-operations-filters';
import { StopDurationThresholdsEditor } from '../../../../../features/fleet-operations/stop-duration-thresholds-editor';
import { TRIP_STOP_STATUS_TONE, TRIP_STOP_TYPE_TONE } from '../../../../../features/trips/operation-status';
import { listDrivers } from '../../../../../lib/api/drivers.api';
import { getFleetOperationsStops } from '../../../../../lib/api/fleet-operations.api';
import { listTripStops } from '../../../../../lib/api/trip-stops.api';
import { ADMIN_ROLES, hasRole } from '../../../../../lib/auth/roles';
import { TRIP_STOP_SOURCE_LABELS, TRIP_STOP_STATUS_LABELS, TRIP_STOP_TYPE_LABELS } from '../../../../../lib/labels';
import type { FleetStopDurationAlertEntity, FleetStopsDriverRankingEntryEntity, TripStopListItemEntity } from '../../../../../types/entities';
import type { TripStopStatus, TripStopType } from '../../../../../types/enums';
import { formatDateTime, formatNumber } from '../../../../../utils/format';

const PAGE_SIZE = 20;

const STOP_TYPE_OPTIONS = Object.entries(TRIP_STOP_TYPE_LABELS) as [TripStopType, string][];
const STOP_STATUS_OPTIONS = Object.entries(TRIP_STOP_STATUS_LABELS) as [TripStopStatus, string][];

function formatDuration(minutes: number | null): string {
  return minutes === null ? '—' : `${formatNumber(minutes)} min`;
}

export default function FleetStopsPage(): JSX.Element {
  const { user } = useAuth();
  const { startDate, setStartDate, endDate, setEndDate, vehicleId, setVehicleId, fleetId, setFleetId, filters, hasActiveFilters, clear } =
    useFleetOperationsFilters();

  const [driverId, setDriverId] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selectedStop, setSelectedStop] = useState<TripStopListItemEntity | null>(null);

  // Fase 44, secao 3 -- o ranking/alertas (parte de dashboardQuery.data)
  // precisam do MESMO escopo da tabela de paradas individuais -- nunca uma
  // segunda interpretacao de filtro. driverId/type/status agora alimentam
  // as duas queries.
  const stopScopeFilters = {
    driverId: driverId || undefined,
    type: (type || undefined) as TripStopType | undefined,
    status: (status || undefined) as TripStopStatus | undefined,
  };
  const dashboardFilters = { ...filters, ...stopScopeFilters };

  const dashboardQuery = useQuery({
    queryKey: ['fleet-operations', 'stops', dashboardFilters],
    queryFn: ({ signal }) => getFleetOperationsStops(dashboardFilters, signal),
  });

  const listFilters = {
    from: startDate || undefined,
    to: endDate || undefined,
    vehicleId: vehicleId || undefined,
    ...stopScopeFilters,
  };

  const listQuery = useQuery({
    queryKey: ['trip-stops', 'list', page, listFilters],
    queryFn: ({ signal }) => listTripStops({ page, pageSize: PAGE_SIZE, ...listFilters }, signal),
  });

  const hasListFilters = Boolean(driverId || type || status);

  const typeColumns = useMemo<ColumnDef<{ type: TripStopType; count: number; totalDurationMinutes: number }, unknown>[]>(
    () => [
      { header: 'Tipo', accessorFn: (row) => TRIP_STOP_TYPE_LABELS[row.type] },
      { header: 'Quantidade', accessorFn: (row) => formatNumber(row.count) },
      { header: 'Duração total', accessorFn: (row) => `${formatNumber(row.totalDurationMinutes)} min` },
    ],
    [],
  );

  const stopColumns = useMemo<ColumnDef<TripStopListItemEntity, unknown>[]>(
    () => [
      { header: 'Data', cell: ({ row }) => formatDateTime(row.original.startedAt) },
      { header: 'Placa', accessorFn: (row) => row.vehiclePlate },
      { header: 'Motorista', accessorFn: (row) => row.driverName ?? '—' },
      { header: 'Viagem', accessorFn: (row) => row.tripReference ?? '—' },
      {
        header: 'Tipo',
        cell: ({ row }) => <Badge tone={TRIP_STOP_TYPE_TONE[row.original.type]}>{TRIP_STOP_TYPE_LABELS[row.original.type]}</Badge>,
      },
      { header: 'Início', cell: ({ row }) => formatDateTime(row.original.startedAt) },
      { header: 'Fim', cell: ({ row }) => (row.original.endedAt ? formatDateTime(row.original.endedAt) : '—') },
      { header: 'Duração', cell: ({ row }) => formatDuration(row.original.durationMinutes) },
      { header: 'Origem', accessorFn: (row) => TRIP_STOP_SOURCE_LABELS[row.source] },
      {
        header: 'Status',
        cell: ({ row }) => <Badge tone={TRIP_STOP_STATUS_TONE[row.original.status]}>{TRIP_STOP_STATUS_LABELS[row.original.status]}</Badge>,
      },
    ],
    [],
  );

  const driverRankingColumns = useMemo<ColumnDef<FleetStopsDriverRankingEntryEntity, unknown>[]>(
    () => [
      { header: 'Posição', accessorFn: (row) => `#${row.rankPosition}` },
      { header: 'Motorista', accessorFn: (row) => row.driverName },
      { header: 'Paradas', accessorFn: (row) => formatNumber(row.stopsCount) },
      { header: 'Tempo total', accessorFn: (row) => `${formatNumber(row.totalDurationMinutes)} min` },
      { header: 'Média', accessorFn: (row) => formatDuration(row.averageDurationMinutes) },
      { header: 'Maior', accessorFn: (row) => formatDuration(row.maxDurationMinutes) },
      { header: 'Menor', accessorFn: (row) => formatDuration(row.minDurationMinutes) },
    ],
    [],
  );

  const durationAlertColumns = useMemo<ColumnDef<FleetStopDurationAlertEntity, unknown>[]>(
    () => [
      {
        header: 'Tipo',
        cell: ({ row }) => <Badge tone={TRIP_STOP_TYPE_TONE[row.original.type]}>{TRIP_STOP_TYPE_LABELS[row.original.type]}</Badge>,
      },
      { header: 'Veículo', accessorFn: (row) => row.vehiclePlate },
      { header: 'Motorista', accessorFn: (row) => row.driverName ?? '—' },
      { header: 'Viagem', accessorFn: (row) => row.tripReference ?? '—' },
      { header: 'Duração', accessorFn: (row) => `${formatNumber(row.durationMinutes)} min` },
      { header: 'Limite', accessorFn: (row) => `${formatNumber(row.thresholdMinutes)} min` },
      {
        header: 'Excesso',
        cell: ({ row }) => <Badge tone="danger">+{formatNumber(row.original.excessMinutes)} min</Badge>,
      },
      { header: 'Início', cell: ({ row }) => formatDateTime(row.original.startedAt) },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Controle de Paradas e Tempos Operacionais"
        description="Paradas registradas pelo app do motorista e lançadas administrativamente, com indicadores de tempo parado e ociosidade da frota."
      />

      <FleetFilters
        idPrefix="fstop"
        startDate={startDate}
        onStartDateChange={(v) => {
          setStartDate(v);
          setPage(1);
        }}
        endDate={endDate}
        onEndDateChange={(v) => {
          setEndDate(v);
          setPage(1);
        }}
        vehicleId={vehicleId}
        onVehicleIdChange={(v) => {
          setVehicleId(v);
          setPage(1);
        }}
        fleetId={fleetId}
        onFleetIdChange={setFleetId}
        hasActiveFilters={hasActiveFilters}
        onClear={clear}
      />

      <FilterBar
        hasActiveFilters={hasListFilters}
        onClear={() => {
          setDriverId('');
          setType('');
          setStatus('');
          setPage(1);
        }}
      >
        <FormField label="Motorista" htmlFor="fstop-driver" className="w-full sm:w-48">
          <EntitySelect
            id="fstop-driver"
            queryKey={['drivers', 'select']}
            queryFn={() => listDrivers({ pageSize: 100 })}
            getOptionValue={(d) => d.id}
            getOptionLabel={(d) => d.name}
            value={driverId}
            onChange={(v) => {
              setDriverId(v);
              setPage(1);
            }}
            placeholder="Todos"
          />
        </FormField>
        <FormField label="Tipo de parada" htmlFor="fstop-type" className="w-full sm:w-48">
          <Select
            id="fstop-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {STOP_TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Status" htmlFor="fstop-status" className="w-full sm:w-40">
          <Select
            id="fstop-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {STOP_STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
      </FilterBar>

      {dashboardQuery.isLoading && <SkeletonCards count={4} />}
      {dashboardQuery.isError && <ErrorState onRetry={() => dashboardQuery.refetch()} />}

      {dashboardQuery.data && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Total de paradas" value={formatNumber(dashboardQuery.data.totalStops)} icon={ParkingSquare} />
            <StatCard label="Tempo total parado" value={`${formatNumber(dashboardQuery.data.totalDurationMinutes)} min`} />
            <StatCard
              label="Tempo médio de parada"
              value={dashboardQuery.data.averageDurationMinutes === null ? '—' : `${formatNumber(dashboardQuery.data.averageDurationMinutes, 1)} min`}
              icon={Clock}
            />
            <StatCard
              label="Maior parada"
              value={dashboardQuery.data.maxDurationMinutes === null ? '—' : `${formatNumber(dashboardQuery.data.maxDurationMinutes)} min`}
              icon={Hourglass}
            />
            <StatCard
              label="Menor parada"
              value={dashboardQuery.data.minDurationMinutes === null ? '—' : `${formatNumber(dashboardQuery.data.minDurationMinutes)} min`}
              icon={Timer}
            />
          </div>

          <Card>
            <CardHeader title="Por tipo de parada" />
            <DataTable columns={typeColumns} data={dashboardQuery.data.byType} emptyTitle="Sem paradas no período/filtro." />
          </Card>

          <MonthlyChartCard
            title="Evolução mensal da quantidade de paradas"
            data={dashboardQuery.data.monthlyTrend}
            color="#0891b2"
            valueFormatter={(v) => formatNumber(v)}
          />

          <BarRankingChart
            title="Top 5 veículos por tempo parado"
            data={dashboardQuery.data.topVehiclesByDuration.map((v) => ({ label: v.plate, value: v.value }))}
            color="#0891b2"
            valueFormatter={(v) => `${formatNumber(v)} min`}
            emptyMessage="Nenhum veículo com parada registrada no período/filtro selecionado."
          />

          <Card>
            <CardHeader
              title="🏆 Ranking de motoristas por tempo parado"
              description="Ordenado por tempo total parado. Motoristas sem paradas no período/filtro não aparecem."
            />
            <DataTable
              columns={driverRankingColumns}
              data={dashboardQuery.data.driverRanking}
              emptyTitle="Nenhum motorista com parada registrada no período/filtro selecionado."
            />
          </Card>

          <Card>
            <CardHeader
              title="⚠️ Alertas de paradas"
              description="Paradas concluídas cuja duração excedeu o limite configurado para o tipo. Nunca inclui parada cancelada ou ainda aberta."
              action={
                dashboardQuery.data.durationAlerts.length > 0 ? (
                  <Badge tone="danger">{dashboardQuery.data.durationAlerts.length} alerta(s)</Badge>
                ) : undefined
              }
            />
            <DataTable
              columns={durationAlertColumns}
              data={dashboardQuery.data.durationAlerts}
              emptyTitle="Nenhuma parada excedeu o limite configurado no período/filtro selecionado."
            />
          </Card>

          {hasRole(user?.role, ADMIN_ROLES) && <StopDurationThresholdsEditor />}
        </div>
      )}

      <div className="mt-8">
        <CardHeader title="Paradas registradas" description="Lista individual, respeitando os mesmos filtros acima." />

        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <DataTable
            columns={stopColumns}
            data={listQuery.data?.items ?? []}
            isLoading={listQuery.isLoading}
            isError={listQuery.isError}
            onRetry={() => listQuery.refetch()}
            getRowId={(s) => s.id}
            onRowClick={(stop) => setSelectedStop(stop)}
            emptyTitle="Nenhuma parada encontrada para o período/filtro selecionado."
          />
          {listQuery.data && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
        </div>
      </div>

      {selectedStop && (
        <Modal open onClose={() => setSelectedStop(null)} title="Detalhe da parada" size="md">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <DetailRow label="Tipo" value={TRIP_STOP_TYPE_LABELS[selectedStop.type]} />
            <DetailRow label="Status" value={TRIP_STOP_STATUS_LABELS[selectedStop.status]} />
            <DetailRow label="Veículo" value={selectedStop.vehiclePlate} />
            <DetailRow label="Motorista" value={selectedStop.driverName ?? 'Não informado'} />
            <DetailRow label="Viagem" value={selectedStop.tripReference ?? 'Não informado'} />
            <DetailRow label="Origem do registro" value={TRIP_STOP_SOURCE_LABELS[selectedStop.source]} />
            <DetailRow label="Início" value={formatDateTime(selectedStop.startedAt)} />
            <DetailRow label="Fim" value={selectedStop.endedAt ? formatDateTime(selectedStop.endedAt) : 'Em andamento'} />
            <DetailRow label="Duração" value={formatDuration(selectedStop.durationMinutes)} />
            <DetailRow
              label="Localização"
              value={
                selectedStop.latitude !== null && selectedStop.longitude !== null
                  ? `${selectedStop.latitude.toFixed(5)}, ${selectedStop.longitude.toFixed(5)}`
                  : 'Não informado'
              }
            />
            <DetailRow label="Local identificado" value={selectedStop.locationLabel ?? 'Não informado'} />
            <DetailRow label="Observação" value={selectedStop.notes ?? 'Nenhuma'} />
            {selectedStop.cancelledAt && <DetailRow label="Cancelada em" value={formatDateTime(selectedStop.cancelledAt)} />}
            <DetailRow label="Id do evento (deviceEventId)" value={selectedStop.deviceEventId} />
            <DetailRow label="Criada em" value={formatDateTime(selectedStop.createdAt)} />
            <DetailRow label="Atualizada em" value={formatDateTime(selectedStop.updatedAt)} />
          </dl>
        </Modal>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt className="text-xs font-medium text-ink-subtle">{label}</dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}
