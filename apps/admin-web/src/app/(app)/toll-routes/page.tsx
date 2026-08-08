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
import { Select } from '../../../components/ui/select';
import { useAuth } from '../../../hooks/use-auth';
import { useDebounce } from '../../../hooks/use-debounce';
import { CreateRouteModal } from '../../../features/tolls/create-route-modal';
import { listTollRoutes } from '../../../lib/api/toll-routes.api';
import { TOLL_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import type { TollRouteEntity } from '../../../types/entities';

const PAGE_SIZE = 20;

export default function TollRoutesPage(): JSX.Element {
  const { user } = useAuth();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isActive, setIsActive] = useState<'' | 'true' | 'false'>('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounce(search);

  const query = useQuery({
    queryKey: ['toll-routes', 'list', { page, search: debouncedSearch, isActive }],
    queryFn: ({ signal }) =>
      listTollRoutes(
        {
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          isActive: isActive === '' ? undefined : isActive === 'true',
        },
        signal,
      ),
  });

  const columns = useMemo<ColumnDef<TollRouteEntity, unknown>[]>(
    () => [
      { header: 'Rota', accessorFn: (row) => row.name },
      { header: 'Origem', accessorFn: (row) => row.originLabel },
      { header: 'Destino', accessorFn: (row) => row.destinationLabel },
      {
        header: 'Praças',
        cell: ({ row }) => `${row.original.stops.length} praça(s)`,
      },
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
        title="Rotas de pedágio"
        description="Corredores operacionais com as praças esperadas, em ordem — usados na conciliação de pedágio das viagens."
        actions={
          hasRole(user?.role, TOLL_WRITE_ROLES) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Nova rota
            </Button>
          )
        }
      />

      <FilterBar
        hasActiveFilters={Boolean(search) || isActive !== ''}
        onClear={() => {
          setSearch('');
          setIsActive('');
          setPage(1);
        }}
      >
        <FormField label="Buscar" htmlFor="route-search" className="w-full sm:w-64">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Nome, origem, destino..."
          />
        </FormField>
        <FormField label="Status" htmlFor="route-status" className="w-full sm:w-40">
          <Select
            id="route-status"
            value={isActive}
            onChange={(e) => {
              setIsActive(e.target.value as '' | 'true' | 'false');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            <option value="true">Ativas</option>
            <option value="false">Inativas</option>
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
          onRowClick={(route) => router.push(`/toll-routes/${route.id}`)}
          getRowId={(r) => r.id}
          emptyTitle="Nenhuma rota de pedágio cadastrada"
          emptyDescription="Crie uma rota para determinar as praças esperadas de suas viagens e habilitar a conciliação."
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreateRouteModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
