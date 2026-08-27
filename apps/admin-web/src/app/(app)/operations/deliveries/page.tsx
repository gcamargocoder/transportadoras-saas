'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { DataTable } from '../../../../components/ui/data-table';
import { DatePicker } from '../../../../components/ui/date-picker';
import { EntitySelect } from '../../../../components/ui/entity-select';
import { ErrorState } from '../../../../components/ui/error-state';
import { FilterBar } from '../../../../components/ui/filter-bar';
import { FormField } from '../../../../components/ui/form-field';
import { Input } from '../../../../components/ui/input';
import { PageHeader } from '../../../../components/ui/page-header';
import { Pagination } from '../../../../components/ui/pagination';
import { Select } from '../../../../components/ui/select';
import { SkeletonCards } from '../../../../components/ui/skeleton';
import { StatCard } from '../../../../components/ui/stat-card';
import { TRIP_DELIVERY_STOP_STATUS_TONE } from '../../../../features/trips/status';
import { getDeliveryStopsDashboard, listCustomers, listDeliveryStops } from '../../../../lib/api/trips.api';
import { TRIP_DELIVERY_STOP_STATUS_LABELS, labelOrValue } from '../../../../lib/labels';
import type { DeliveryStopListItemEntity } from '../../../../types/entities';
import type { TripDeliveryStopStatus } from '../../../../types/enums';
import { formatDateTime } from '../../../../utils/format';

const PAGE_SIZE = 20;

// Fase 99 -- Gestao de Entregas: visao CROSS-TRIP das paradas/entregas
// planejadas (busca/filtros/paginacao/dashboard). Reaproveita integralmente
// TripDeliveryStop (Fase 88) -- nenhuma entidade/logica nova aqui, so uma
// visao consolidada alem do detalhe por viagem (aba "Entregas" da propria
// viagem continua sendo a fonte operacional principal).
export default function DeliveriesPage(): JSX.Element {
  const router = useRouter();
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState<TripDeliveryStopStatus | ''>('');
  const [search, setSearch] = useState('');
  const [plannedFrom, setPlannedFrom] = useState('');
  const [plannedTo, setPlannedTo] = useState('');
  const [late, setLate] = useState(false);
  const [page, setPage] = useState(1);

  const hasActiveFilters = Boolean(customerId || status || search || plannedFrom || plannedTo || late);

  const filters = {
    customerId: customerId || undefined,
    search: search || undefined,
    plannedFrom: plannedFrom || undefined,
    plannedTo: plannedTo || undefined,
  };

  const dashboardQuery = useQuery({
    queryKey: ['delivery-stops', 'dashboard', filters],
    queryFn: ({ signal }) => getDeliveryStopsDashboard(filters, signal),
  });

  const listQuery = useQuery({
    queryKey: ['delivery-stops', 'list', { ...filters, status, late, page }],
    queryFn: ({ signal }) =>
      listDeliveryStops(
        { ...filters, status: status || undefined, late: late || undefined, page, pageSize: PAGE_SIZE },
        signal,
      ),
  });

  const columns = useMemo<ColumnDef<DeliveryStopListItemEntity, unknown>[]>(
    () => [
      {
        header: 'Viagem',
        cell: ({ row }) => (
          <div className="text-xs">
            <div>
              {row.original.tripOriginName} → {row.original.tripDestinationName}
            </div>
            {row.original.driverName && <div className="text-ink-subtle">{row.original.driverName}</div>}
          </div>
        ),
      },
      { header: 'Cliente/destinatário', cell: ({ row }) => row.original.customerName ?? '—' },
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
        header: 'Previsão',
        cell: ({ row }) => (row.original.plannedArrival ? formatDateTime(row.original.plannedArrival) : '—'),
      },
      {
        header: 'Execução',
        cell: ({ row }) => {
          const s = row.original;
          if (s.status === 'FAILED') return <span className="text-xs text-danger-600">{s.failureReason ?? '—'}</span>;
          if (!s.deliveredAt) return '—';
          return <span className="text-xs">{formatDateTime(s.deliveredAt)}</span>;
        },
      },
    ],
    [],
  );

  const summary = dashboardQuery.data;

  return (
    <div>
      <PageHeader
        title="Entregas"
        description="Visão operacional das entregas de todas as viagens — busca, filtros, paginação e resumo por status."
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setCustomerId('');
          setStatus('');
          setSearch('');
          setPlannedFrom('');
          setPlannedTo('');
          setLate(false);
          setPage(1);
        }}
      >
        <FormField label="Busca" htmlFor="deliveries-search" className="w-full sm:w-56">
          <Input
            id="deliveries-search"
            placeholder="Cliente ou local..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Cliente" htmlFor="deliveries-customer" className="w-full sm:w-56">
          <EntitySelect
            id="deliveries-customer"
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
        <FormField label="Status" htmlFor="deliveries-status" className="w-full sm:w-44">
          <Select
            id="deliveries-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as TripDeliveryStopStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(TRIP_DELIVERY_STOP_STATUS_LABELS) as TripDeliveryStopStatus[]).map((s) => (
              <option key={s} value={s}>
                {labelOrValue(TRIP_DELIVERY_STOP_STATUS_LABELS, s)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Previsão de" htmlFor="deliveries-planned-from" className="w-full sm:w-40">
          <DatePicker
            id="deliveries-planned-from"
            value={plannedFrom}
            onChange={(e) => {
              setPlannedFrom(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Previsão até" htmlFor="deliveries-planned-to" className="w-full sm:w-40">
          <DatePicker
            id="deliveries-planned-to"
            value={plannedTo}
            onChange={(e) => {
              setPlannedTo(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Atraso" htmlFor="deliveries-late" className="w-full sm:w-40">
          <Select
            id="deliveries-late"
            value={late ? 'true' : ''}
            onChange={(e) => {
              setLate(e.target.value === 'true');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            <option value="true">Somente atrasadas</option>
          </Select>
        </FormField>
      </FilterBar>

      {dashboardQuery.isLoading && <SkeletonCards count={6} />}
      {dashboardQuery.isError && <ErrorState onRetry={() => dashboardQuery.refetch()} />}

      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total" value={String(summary.totalCount)} />
          <StatCard label="Pendentes" value={String(summary.pendingCount)} />
          <StatCard label="Em andamento" value={String(summary.inProgressCount)} tone="info" />
          <StatCard label="Concluídas" value={String(summary.completedCount)} tone="success" />
          <StatCard label="Com falha" value={String(summary.failedCount)} tone="danger" />
          <StatCard label="Atrasadas" value={String(summary.lateCount)} tone="warning" />
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={listQuery.data?.items ?? []}
          isLoading={listQuery.isLoading}
          isError={listQuery.isError}
          onRetry={() => listQuery.refetch()}
          getRowId={(r) => r.id}
          onRowClick={(r) => router.push(`/trips/${r.tripId}`)}
          emptyTitle="Nenhuma entrega encontrada no filtro selecionado"
        />
        {listQuery.data && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
      </div>
    </div>
  );
}
