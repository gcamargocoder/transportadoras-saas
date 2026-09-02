'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { DatePicker } from '../../../components/ui/date-picker';
import { EntitySelect } from '../../../components/ui/entity-select';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { SearchInput } from '../../../components/ui/search-input';
import { Select } from '../../../components/ui/select';
import { useDebounce } from '../../../hooks/use-debounce';
import { listDrivers } from '../../../lib/api/drivers.api';
import { listVehicles } from '../../../lib/api/fleet.api';
import { listCustomers, listLocations, listTrips } from '../../../lib/api/trips.api';
import { hasRole } from '../../../lib/auth/roles';
import { useAuth } from '../../../hooks/use-auth';
import { TRIP_LOAD_STATUS_LABELS, TRIP_PRIORITY_LABELS, TRIP_STATUS_LABELS } from '../../../lib/labels';
import { TRIP_STATUS_OPTIONS, TRIP_STATUS_TONE } from '../../../features/trips/status';
import { TRIP_WRITE_ROLES } from '../../../lib/auth/roles';
import type { TripEntity } from '../../../types/entities';
import type { TripStatus } from '../../../types/enums';
import { formatDateTime } from '../../../utils/format';
import { CreateTripModal } from '../../../features/trips/create-trip-modal';

const PAGE_SIZE = 20;

export default function TripsPage(): JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TripStatus | ''>('');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [originLocationId, setOriginLocationId] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [departureFrom, setDepartureFrom] = useState('');
  const [departureTo, setDepartureTo] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const debouncedSearch = useDebounce(search);

  const query = useQuery({
    queryKey: [
      'trips',
      {
        page,
        search: debouncedSearch,
        status,
        driverId,
        vehicleId,
        customerId,
        originLocationId,
        destinationLocationId,
        departureFrom,
        departureTo,
      },
    ],
    queryFn: ({ signal }) =>
      listTrips(
        {
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          status: status || undefined,
          driverId: driverId || undefined,
          vehicleId: vehicleId || undefined,
          customerId: customerId || undefined,
          originLocationId: originLocationId || undefined,
          destinationLocationId: destinationLocationId || undefined,
          departureFrom: departureFrom || undefined,
          departureTo: departureTo || undefined,
        },
        signal,
      ),
  });

  const columns = useMemo<ColumnDef<TripEntity, unknown>[]>(
    () => [
      {
        header: 'Rota',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink">
              {row.original.originName} → {row.original.destinationName}
            </p>
            <p className="text-xs text-ink-subtle">{row.original.vehiclePlate ?? 'Sem veículo'}</p>
            {/* Fase D -- vinculo EXPLICITO ida -> retorno, so quando o operador informou. */}
            {row.original.previousTripId && (
              <p className="text-xs font-medium text-brand-600">↩ Retorno</p>
            )}
          </div>
        ),
      },
      { header: 'Cliente', accessorFn: (row) => row.customerName ?? '-' },
      { header: 'Motorista', accessorFn: (row) => row.driverName ?? '-' },
      {
        header: 'Carga',
        cell: ({ row }) => (
          <div>
            <p className="text-sm text-ink">
              {row.original.loadStatus ? TRIP_LOAD_STATUS_LABELS[row.original.loadStatus] : '—'}
            </p>
            {row.original.plannedLoadStatus && (
              <p className="text-xs text-ink-subtle">
                Planejado: {TRIP_LOAD_STATUS_LABELS[row.original.plannedLoadStatus]}
              </p>
            )}
          </div>
        ),
      },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={TRIP_STATUS_TONE[row.original.status]}>
            {TRIP_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      {
        header: 'Prioridade',
        cell: ({ row }) => <span>{TRIP_PRIORITY_LABELS[row.original.priority]}</span>,
      },
      {
        header: 'Saída prevista',
        cell: ({ row }) => formatDateTime(row.original.plannedDeparture),
      },
    ],
    [],
  );

  const hasActiveFilters = Boolean(
    search ||
      status ||
      driverId ||
      vehicleId ||
      customerId ||
      originLocationId ||
      destinationLocationId ||
      departureFrom ||
      departureTo,
  );

  return (
    <div>
      <PageHeader
        title="Viagens"
        description="Acompanhe e gerencie as viagens da operação."
        actions={
          hasRole(user?.role, TRIP_WRITE_ROLES) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Nova viagem
            </Button>
          )
        }
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setSearch('');
          setStatus('');
          setDriverId('');
          setVehicleId('');
          setCustomerId('');
          setOriginLocationId('');
          setDestinationLocationId('');
          setDepartureFrom('');
          setDepartureTo('');
          setPage(1);
        }}
      >
        <FormField label="Buscar" htmlFor="trip-search" className="w-full sm:w-64">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Cliente, origem, destino..."
          />
        </FormField>
        <FormField label="Status" htmlFor="trip-status" className="w-full sm:w-48">
          <Select
            id="trip-status"
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
        <FormField label="Motorista" htmlFor="trip-driver" className="w-full sm:w-48">
          <EntitySelect
            id="trip-driver"
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
        <FormField label="Veículo" htmlFor="trip-vehicle" className="w-full sm:w-48">
          <EntitySelect
            id="trip-vehicle"
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
        <FormField label="Cliente" htmlFor="trip-customer" className="w-full sm:w-48">
          <EntitySelect
            id="trip-customer"
            queryKey={['customers', 'select']}
            queryFn={() => listCustomers({ pageSize: 100 })}
            getOptionValue={(c) => c.id}
            getOptionLabel={(c) => c.name}
            value={customerId}
            onChange={(v) => {
              setCustomerId(v);
              setPage(1);
            }}
            placeholder="Todos"
          />
        </FormField>
        <FormField label="Origem" htmlFor="trip-origin" className="w-full sm:w-48">
          <EntitySelect
            id="trip-origin"
            queryKey={['locations', 'select']}
            queryFn={() => listLocations({ pageSize: 100 })}
            getOptionValue={(l) => l.id}
            getOptionLabel={(l) => l.name}
            value={originLocationId}
            onChange={(v) => {
              setOriginLocationId(v);
              setPage(1);
            }}
            placeholder="Todas"
          />
        </FormField>
        <FormField label="Destino" htmlFor="trip-destination" className="w-full sm:w-48">
          <EntitySelect
            id="trip-destination"
            queryKey={['locations', 'select']}
            queryFn={() => listLocations({ pageSize: 100 })}
            getOptionValue={(l) => l.id}
            getOptionLabel={(l) => l.name}
            value={destinationLocationId}
            onChange={(v) => {
              setDestinationLocationId(v);
              setPage(1);
            }}
            placeholder="Todas"
          />
        </FormField>
        <FormField label="Saída de" htmlFor="trip-from" className="w-full sm:w-40">
          <DatePicker
            id="trip-from"
            value={departureFrom}
            onChange={(e) => {
              setDepartureFrom(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Saída até" htmlFor="trip-to" className="w-full sm:w-40">
          <DatePicker
            id="trip-to"
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
          data={query.data?.items ?? []}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => query.refetch()}
          onRowClick={(trip) => router.push(`/trips/${trip.id}`)}
          getRowId={(trip) => trip.id}
          emptyTitle="Nenhuma viagem encontrada"
          emptyDescription="Não existem viagens para os filtros selecionados."
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreateTripModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
