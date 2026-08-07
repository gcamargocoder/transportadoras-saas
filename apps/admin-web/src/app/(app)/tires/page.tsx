'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CircleDot, Plus, Recycle, Warehouse } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { SearchInput } from '../../../components/ui/search-input';
import { Select } from '../../../components/ui/select';
import { SkeletonCards } from '../../../components/ui/skeleton';
import { StatCard } from '../../../components/ui/stat-card';
import { useAuth } from '../../../hooks/use-auth';
import { useDebounce } from '../../../hooks/use-debounce';
import { CreateTireModal } from '../../../features/tires/create-tire-modal';
import { TIRE_STATUS_TONE } from '../../../features/tires/status';
import { getTireDashboard, listTires } from '../../../lib/api/tires.api';
import { FLEET_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import { TIRE_STATUS_LABELS } from '../../../lib/labels';
import type { TireEntity } from '../../../types/entities';
import type { TireStatus } from '../../../types/enums';
import { formatNumber } from '../../../utils/format';

const PAGE_SIZE = 20;

export default function TiresPage(): JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TireStatus | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounce(search);

  const dashboardQuery = useQuery({
    queryKey: ['tires', 'dashboard'],
    queryFn: ({ signal }) => getTireDashboard(signal),
  });

  const listQuery = useQuery({
    queryKey: ['tires', 'list', { page, search: debouncedSearch, status }],
    queryFn: ({ signal }) =>
      listTires(
        {
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          status: status || undefined,
        },
        signal,
      ),
  });

  const columns = useMemo<ColumnDef<TireEntity, unknown>[]>(
    () => [
      {
        header: 'Pneu',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink">{row.original.fireNumber}</p>
            <p className="text-xs text-ink-subtle">
              {row.original.manufacturer} {row.original.model} · {row.original.size}
            </p>
          </div>
        ),
      },
      {
        header: 'Localização',
        cell: ({ row }) => {
          const t = row.original;
          if (t.locationType === 'VEHICLE')
            return `Veículo ${t.vehiclePlate ?? '?'}${t.position ? ` (${t.position})` : ''}`;
          if (t.locationType === 'TRAILER')
            return `Carreta ${t.trailerPlate ?? '?'}${t.position ? ` (${t.position})` : ''}`;
          return 'Estoque';
        },
      },
      {
        header: 'Sulco atual',
        cell: ({ row }) =>
          row.original.currentTreadDepthMm
            ? `${formatNumber(row.original.currentTreadDepthMm, 1)} mm`
            : '-',
      },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={TIRE_STATUS_TONE[row.original.status]}>
            {TIRE_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Pneus"
        description="Gestão de pneus: estoque, uso, recapagens e descarte."
        actions={
          hasRole(user?.role, FLEET_WRITE_ROLES) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Novo pneu
            </Button>
          )
        }
      />

      {dashboardQuery.isLoading && <SkeletonCards />}
      {dashboardQuery.data && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Em estoque"
            value={String(dashboardQuery.data.stockCount)}
            icon={Warehouse}
          />
          <StatCard
            label="Em uso"
            value={String(dashboardQuery.data.inUseCount)}
            icon={CircleDot}
            tone="success"
          />
          <StatCard
            label="Já recapados"
            value={String(dashboardQuery.data.retreadedTiresCount)}
            icon={Recycle}
            tone="info"
          />
          <StatCard
            label="Próximos da troca"
            value={String(dashboardQuery.data.nearReplacementCount)}
            icon={AlertTriangle}
            tone={dashboardQuery.data.nearReplacementCount > 0 ? 'warning' : 'success'}
          />
        </div>
      )}

      <FilterBar
        hasActiveFilters={Boolean(search || status)}
        onClear={() => {
          setSearch('');
          setStatus('');
          setPage(1);
        }}
      >
        <FormField label="Buscar" htmlFor="tire-search" className="w-full sm:w-64">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Número de fogo, marca, modelo..."
          />
        </FormField>
        <FormField label="Status" htmlFor="tire-status" className="w-full sm:w-48">
          <Select
            id="tire-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as TireStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(TIRE_STATUS_LABELS) as TireStatus[]).map((s) => (
              <option key={s} value={s}>
                {TIRE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={listQuery.data?.items ?? []}
          isLoading={listQuery.isLoading}
          isError={listQuery.isError}
          onRetry={() => listQuery.refetch()}
          onRowClick={(tire) => router.push(`/tires/${tire.id}`)}
          getRowId={(tire) => tire.id}
          emptyTitle="Nenhum pneu encontrado"
        />
        {listQuery.data && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
      </div>

      <CreateTireModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
