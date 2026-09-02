'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Gauge, Route as RouteIcon, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Card, CardHeader } from '../../../../../components/ui/card';
import { DatePicker } from '../../../../../components/ui/date-picker';
import { DataTable } from '../../../../../components/ui/data-table';
import { EntitySelect } from '../../../../../components/ui/entity-select';
import { FilterBar } from '../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../components/ui/form-field';
import { PageHeader } from '../../../../../components/ui/page-header';
import { Pagination } from '../../../../../components/ui/pagination';
import { Select } from '../../../../../components/ui/select';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { EMPTY_TRIP_REASON_TONE, TRIP_STATUS_OPTIONS, TRIP_STATUS_TONE } from '../../../../../features/trips/status';
import { getFleetOperationsEmptyTrips } from '../../../../../lib/api/fleet-operations.api';
import { listDrivers } from '../../../../../lib/api/drivers.api';
import { listVehicles } from '../../../../../lib/api/fleet.api';
import { listEmptyTrips } from '../../../../../lib/api/trips.api';
import { EMPTY_TRIP_REASON_LABELS, TRIP_STATUS_LABELS } from '../../../../../lib/labels';
import type { EmptyTripEntity } from '../../../../../types/entities';
import type { TripStatus } from '../../../../../types/enums';
import { formatCurrency, formatDateTime, formatNumber } from '../../../../../utils/format';

const PAGE_SIZE = 20;

function nullableKm(value: number | null): string {
  return value === null ? '—' : `${formatNumber(value, 1)} km`;
}

function nullableCurrency(value: number | null): string {
  return value === null ? '—' : formatCurrency(value);
}

// Fase 92 -- viagens vazias (Trip.loadStatus = EMPTY, informado pelo
// motorista na largada). Reaproveita integralmente os componentes ja
// usados por /trips e pelo dashboard de frota (DataTable/FilterBar/
// StatCard/Pagination) -- nenhum componente novo.
export default function EmptyTripsPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [status, setStatus] = useState<TripStatus | ''>('');
  const [departureFrom, setDepartureFrom] = useState('');
  const [departureTo, setDepartureTo] = useState('');

  const filters = { driverId, vehicleId, status, departureFrom, departureTo };

  const summaryQuery = useQuery({
    queryKey: ['fleet-operations', 'empty-trips-summary', { driverId, vehicleId, startDate: departureFrom, endDate: departureTo }],
    queryFn: ({ signal }) =>
      getFleetOperationsEmptyTrips(
        { driverId: driverId || undefined, vehicleId: vehicleId || undefined, startDate: departureFrom || undefined, endDate: departureTo || undefined },
        signal,
      ),
  });

  const listQuery = useQuery({
    queryKey: ['trips', 'empty-runs', { page, ...filters }],
    queryFn: ({ signal }) =>
      listEmptyTrips(
        {
          page,
          pageSize: PAGE_SIZE,
          driverId: driverId || undefined,
          vehicleId: vehicleId || undefined,
          status: status || undefined,
          departureFrom: departureFrom || undefined,
          departureTo: departureTo || undefined,
        },
        signal,
      ),
  });

  const columns = useMemo<ColumnDef<EmptyTripEntity, unknown>[]>(
    () => [
      {
        header: 'Viagem',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink">
              {row.original.originName} → {row.original.destinationName}
            </p>
            <p className="text-xs text-ink-subtle">{row.original.customerName ?? 'Sem cliente vinculado'}</p>
          </div>
        ),
      },
      {
        header: 'Partida real',
        cell: ({ row }) => (row.original.actualDeparture ? formatDateTime(row.original.actualDeparture) : '—'),
      },
      { header: 'Veículo', accessorFn: (row) => row.vehiclePlate ?? '—' },
      { header: 'Motorista', accessorFn: (row) => row.driverName ?? '—' },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={TRIP_STATUS_TONE[row.original.status]}>{TRIP_STATUS_LABELS[row.original.status]}</Badge>
        ),
      },
      {
        header: 'Motivo',
        cell: ({ row }) => (
          <div>
            <Badge tone={EMPTY_TRIP_REASON_TONE[row.original.reason]}>
              {EMPTY_TRIP_REASON_LABELS[row.original.reason]}
            </Badge>
            {/* Fase D -- CONTEXTO apenas (vinculo explicito ida -> retorno);
                nunca usado para classificar a viagem como vazia -- esse
                criterio continua sendo somente loadStatus === EMPTY. */}
            {row.original.previousTripId && (
              <Link
                href={`/trips/${row.original.previousTripId}`}
                className="mt-1 block text-xs font-medium text-brand-600 hover:underline"
              >
                ↩ Retorno de outra viagem
              </Link>
            )}
          </div>
        ),
      },
      { header: 'Distância', cell: ({ row }) => nullableKm(row.original.distanceKm) },
      { header: 'Custo', cell: ({ row }) => nullableCurrency(row.original.totalCost) },
    ],
    [],
  );

  const hasActiveFilters = Boolean(driverId || vehicleId || status || departureFrom || departureTo);

  return (
    <div>
      <PageHeader
        title="Viagens vazias"
        description="Viagens realizadas sem carga (informado pelo motorista na largada) -- controle operacional e impacto associado."
      />

      {summaryQuery.isLoading && <SkeletonCards count={4} />}
      {summaryQuery.data && (
        <Card className="mb-4">
          <CardHeader
            title="Resumo do período/filtro"
            description="loadStatus nunca informado (dado ausente) nunca conta como vazia nem como carregada."
          />
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Viagens vazias" value={formatNumber(summaryQuery.data.emptyCount)} icon={RouteIcon} tone={summaryQuery.data.emptyCount > 0 ? 'warning' : 'success'} />
            <StatCard label="Viagens carregadas" value={formatNumber(summaryQuery.data.loadedCount)} tone="success" />
            <StatCard
              label="Sem dado informado"
              value={formatNumber(summaryQuery.data.unknownLoadStatusCount)}
              icon={AlertTriangle}
              tone={summaryQuery.data.unknownLoadStatusCount > 0 ? 'warning' : 'success'}
            />
            <StatCard
              label="% vazias (sobre viagens com dado)"
              value={summaryQuery.data.emptyPercent === null ? '—' : `${formatNumber(summaryQuery.data.emptyPercent, 1)}%`}
              icon={Gauge}
            />
            <StatCard
              label="Distância total (vazias)"
              value={
                summaryQuery.data.totalDistanceKm === null
                  ? 'Indisponível'
                  : `${formatNumber(summaryQuery.data.totalDistanceKm, 1)} km`
              }
              icon={RouteIcon}
            />
            <StatCard
              label="Custo total (vazias)"
              value={summaryQuery.data.totalCost === null ? 'Indisponível' : formatCurrency(summaryQuery.data.totalCost)}
              icon={Wallet}
            />
          </div>
          {summaryQuery.data.reasonBreakdown.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-border p-5">
              {summaryQuery.data.reasonBreakdown.map((row) => (
                <Badge key={row.reason} tone={EMPTY_TRIP_REASON_TONE[row.reason]}>
                  {EMPTY_TRIP_REASON_LABELS[row.reason]}: {row.count}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      )}

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setDriverId('');
          setVehicleId('');
          setStatus('');
          setDepartureFrom('');
          setDepartureTo('');
          setPage(1);
        }}
      >
        <FormField label="Motorista" htmlFor="empty-trip-driver" className="w-full sm:w-48">
          <EntitySelect
            id="empty-trip-driver"
            queryKey={['drivers', 'select']}
            queryFn={() => listDrivers({ pageSize: 100, isActive: true })}
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
        <FormField label="Veículo" htmlFor="empty-trip-vehicle" className="w-full sm:w-48">
          <EntitySelect
            id="empty-trip-vehicle"
            queryKey={['vehicles', 'select']}
            queryFn={() => listVehicles({ pageSize: 100 })}
            getOptionValue={(v) => v.id}
            getOptionLabel={(v) => v.plate}
            value={vehicleId}
            onChange={(v) => {
              setVehicleId(v);
              setPage(1);
            }}
            placeholder="Todos"
          />
        </FormField>
        <FormField label="Status" htmlFor="empty-trip-status" className="w-full sm:w-48">
          <Select
            id="empty-trip-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as TripStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {TRIP_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {TRIP_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Partida real de" htmlFor="empty-trip-from" className="w-full sm:w-40">
          <DatePicker
            id="empty-trip-from"
            value={departureFrom}
            onChange={(e) => {
              setDepartureFrom(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Partida real até" htmlFor="empty-trip-to" className="w-full sm:w-40">
          <DatePicker
            id="empty-trip-to"
            value={departureTo}
            onChange={(e) => {
              setDepartureTo(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={listQuery.data?.items ?? []}
          isLoading={listQuery.isLoading}
          isError={listQuery.isError}
          onRetry={() => listQuery.refetch()}
          getRowId={(trip) => trip.id}
          emptyTitle="Nenhuma viagem vazia encontrada"
          emptyDescription="Não existem viagens com loadStatus = EMPTY para os filtros selecionados."
        />
        {listQuery.data && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
      </div>
    </div>
  );
}
