'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
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
import { CreateTrailerModal } from '../../../features/fleet/create-trailer-modal';
import { listTrailers } from '../../../lib/api/fleet.api';
import { FLEET_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import { TRAILER_TYPE_LABELS } from '../../../lib/labels';
import type { TrailerEntity } from '../../../types/entities';

const PAGE_SIZE = 20;

export default function TrailersPage(): JSX.Element {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounce(search);

  const query = useQuery({
    queryKey: ['trailers', { page, search: debouncedSearch }],
    queryFn: ({ signal }) =>
      listTrailers({ page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined }, signal),
  });

  const columns = useMemo<ColumnDef<TrailerEntity, unknown>[]>(
    () => [
      { header: 'Placa', accessorFn: (row) => row.plate },
      { header: 'Tipo', accessorFn: (row) => TRAILER_TYPE_LABELS[row.type] },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={row.original.isActive ? 'success' : 'neutral'}>
            {row.original.isActive ? 'Ativa' : 'Inativa'}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Carretas"
        description="Reboques e semirreboques cadastrados."
        actions={
          hasRole(user?.role, FLEET_WRITE_ROLES) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Nova carreta
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
        <FormField label="Buscar" htmlFor="trailer-search" className="w-full sm:w-64">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Placa..."
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
          getRowId={(t) => t.id}
          emptyTitle="Nenhuma carreta encontrada"
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreateTrailerModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
