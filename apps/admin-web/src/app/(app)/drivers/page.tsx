'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Plus, Truck, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { LimitIndicator } from '../../../components/ui/limit-indicator';
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { SearchInput } from '../../../components/ui/search-input';
import { Select } from '../../../components/ui/select';
import { StatCard } from '../../../components/ui/stat-card';
import { useAuth } from '../../../hooks/use-auth';
import { useDebounce } from '../../../hooks/use-debounce';
import { useTenantPlan } from '../../../hooks/use-tenant-plan';
import { CreateDriverModal } from '../../../features/drivers/create-driver-modal';
import { getDriverSummary, listDrivers } from '../../../lib/api/drivers.api';
import { DRIVER_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import { DRIVER_STATUS_LABELS, DRIVER_STATUS_TONE, DRIVER_TYPE_LABELS, DRIVER_TYPE_TONE, labelOrValue } from '../../../lib/labels';
import type { DriverEntity } from '../../../types/entities';
import type { DriverStatus, DriverType } from '../../../types/enums';
import { formatDate } from '../../../utils/format';

const PAGE_SIZE = 20;

export default function DriversPage(): JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const { plan } = useTenantPlan();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<DriverType | ''>('');
  const [status, setStatus] = useState<DriverStatus | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounce(search);

  const filters = { type: type || undefined, status: status || undefined };
  const hasActiveFilters = Boolean(search || type || status);

  const summaryQuery = useQuery({
    queryKey: ['drivers', 'summary'],
    queryFn: ({ signal }) => getDriverSummary(signal),
  });

  const query = useQuery({
    queryKey: ['drivers', { page, search: debouncedSearch, ...filters }],
    queryFn: ({ signal }) =>
      listDrivers({ page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined, ...filters }, signal),
  });

  const columns = useMemo<ColumnDef<DriverEntity, unknown>[]>(
    () => [
      {
        header: 'Nome',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink">{row.original.name}</p>
            <p className="text-xs text-ink-subtle">
              CNH {row.original.cnhNumber} · {row.original.cnhCategory}
            </p>
          </div>
        ),
      },
      {
        header: 'Classificação',
        cell: ({ row }) => (
          <Badge tone={DRIVER_TYPE_TONE[row.original.type]}>{DRIVER_TYPE_LABELS[row.original.type]}</Badge>
        ),
      },
      { header: 'Veículo atual', accessorFn: (row) => row.currentVehiclePlate ?? '—' },
      { header: 'Telefone', accessorFn: (row) => row.phone ?? '-' },
      { header: 'Vencimento CNH', cell: ({ row }) => formatDate(row.original.cnhExpiresAt) },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={DRIVER_STATUS_TONE[row.original.status]}>{DRIVER_STATUS_LABELS[row.original.status]}</Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Motoristas"
        description="Motoristas próprios, agregados e terceiros vinculados à transportadora."
        actions={
          <>
            {query.data && (
              <LimitIndicator label="Motoristas" current={query.data.meta.total} max={plan?.maxDrivers} />
            )}
            {hasRole(user?.role, DRIVER_WRITE_ROLES) && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={16} />
                Novo motorista
              </Button>
            )}
          </>
        }
      />

      {summaryQuery.data && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Próprios" value={String(summaryQuery.data.totalOwn)} icon={Users} tone="brand" />
          <StatCard label="Agregados" value={String(summaryQuery.data.totalAggregated)} icon={Truck} tone="info" />
          <StatCard label="Terceiros" value={String(summaryQuery.data.totalThirdParty)} />
          <StatCard label="Ativos" value={String(summaryQuery.data.totalActive)} icon={CheckCircle2} tone="success" />
          <StatCard
            label="Suspensos"
            value={String(summaryQuery.data.totalSuspended)}
            icon={AlertTriangle}
            tone={summaryQuery.data.totalSuspended > 0 ? 'warning' : 'success'}
          />
          <StatCard label="Inativos" value={String(summaryQuery.data.totalInactive)} />
        </div>
      )}

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setSearch('');
          setType('');
          setStatus('');
          setPage(1);
        }}
      >
        <FormField label="Buscar" htmlFor="driver-search" className="w-full sm:w-64">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Nome, CPF, CNH..."
          />
        </FormField>
        <FormField label="Classificação" htmlFor="driver-filter-type" className="w-full sm:w-44">
          <Select
            id="driver-filter-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as DriverType | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {(Object.keys(DRIVER_TYPE_LABELS) as DriverType[]).map((t) => (
              <option key={t} value={t}>
                {labelOrValue(DRIVER_TYPE_LABELS, t)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Status" htmlFor="driver-filter-status" className="w-full sm:w-40">
          <Select
            id="driver-filter-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as DriverStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(DRIVER_STATUS_LABELS) as DriverStatus[]).map((s) => (
              <option key={s} value={s}>
                {labelOrValue(DRIVER_STATUS_LABELS, s)}
              </option>
            ))}
          </Select>
        </FormField>
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => query.refetch()}
          onRowClick={(driver) => router.push(`/drivers/${driver.id}`)}
          getRowId={(driver) => driver.id}
          emptyTitle="Nenhum motorista encontrado"
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreateDriverModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
