'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
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
import { useAuth } from '../../../hooks/use-auth';
import { useDebounce } from '../../../hooks/use-debounce';
import { useTenantPlan } from '../../../hooks/use-tenant-plan';
import { listVehicles } from '../../../lib/api/fleet.api';
import { FLEET_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import { CreateVehicleModal } from '../../../features/fleet/create-vehicle-modal';
import { VEHICLE_STATUS_TONE } from '../../../features/fleet/status';
import { VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '../../../lib/labels';
import type { VehicleEntity } from '../../../types/entities';
import type { VehicleStatus } from '../../../types/enums';
import { formatNumber } from '../../../utils/format';

const PAGE_SIZE = 20;

export default function VehiclesPage(): JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const { plan } = useTenantPlan();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<VehicleStatus | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounce(search);

  const query = useQuery({
    queryKey: ['vehicles', { page, search: debouncedSearch, status }],
    queryFn: ({ signal }) =>
      listVehicles(
        {
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          status: status || undefined,
        },
        signal,
      ),
  });

  const columns = useMemo<ColumnDef<VehicleEntity, unknown>[]>(
    () => [
      {
        header: 'Placa',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink">{row.original.plate}</p>
            <p className="text-xs text-ink-subtle">
              {row.original.brand} {row.original.model}
            </p>
          </div>
        ),
      },
      { header: 'Tipo', accessorFn: (row) => VEHICLE_TYPE_LABELS[row.type] },
      { header: 'Odômetro', cell: ({ row }) => `${formatNumber(row.original.odometerKm)} km` },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={VEHICLE_STATUS_TONE[row.original.status]}>
            {VEHICLE_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Veículos"
        description="Frota de veículos cadastrados na transportadora."
        actions={
          <>
            {query.data && (
              <LimitIndicator label="Veículos" current={query.data.meta.total} max={plan?.maxVehicles} />
            )}
            {hasRole(user?.role, FLEET_WRITE_ROLES) && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={16} />
                Novo veículo
              </Button>
            )}
          </>
        }
      />

      <FilterBar
        hasActiveFilters={Boolean(search || status)}
        onClear={() => {
          setSearch('');
          setStatus('');
          setPage(1);
        }}
      >
        <FormField label="Buscar" htmlFor="vehicle-search" className="w-full sm:w-64">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Placa, marca, modelo..."
          />
        </FormField>
        <FormField label="Status" htmlFor="vehicle-status" className="w-full sm:w-48">
          <Select
            id="vehicle-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as VehicleStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(VEHICLE_STATUS_LABELS) as VehicleStatus[]).map((s) => (
              <option key={s} value={s}>
                {VEHICLE_STATUS_LABELS[s]}
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
          onRowClick={(vehicle) => router.push(`/vehicles/${vehicle.id}`)}
          getRowId={(vehicle) => vehicle.id}
          emptyTitle="Nenhum veículo encontrado"
          emptyDescription="Não existem veículos para os filtros selecionados."
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreateVehicleModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
