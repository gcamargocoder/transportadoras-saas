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
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { SearchInput } from '../../../components/ui/search-input';
import { useAuth } from '../../../hooks/use-auth';
import { useDebounce } from '../../../hooks/use-debounce';
import { CreateDriverModal } from '../../../features/drivers/create-driver-modal';
import { listDrivers } from '../../../lib/api/drivers.api';
import { DRIVER_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import type { DriverEntity } from '../../../types/entities';
import { formatDate } from '../../../utils/format';

const PAGE_SIZE = 20;

export default function DriversPage(): JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounce(search);

  const query = useQuery({
    queryKey: ['drivers', { page, search: debouncedSearch }],
    queryFn: ({ signal }) =>
      listDrivers({ page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined }, signal),
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
      { header: 'Telefone', accessorFn: (row) => row.phone ?? '-' },
      { header: 'Vencimento CNH', cell: ({ row }) => formatDate(row.original.cnhExpiresAt) },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={row.original.isActive ? 'success' : 'neutral'}>
            {row.original.isActive ? 'Ativo' : 'Inativo'}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Motoristas"
        description="Motoristas cadastrados na transportadora."
        actions={
          hasRole(user?.role, DRIVER_WRITE_ROLES) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Novo motorista
            </Button>
          )
        }
      />

      <FilterBar
        hasActiveFilters={Boolean(search)}
        onClear={() => {
          setSearch('');
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
