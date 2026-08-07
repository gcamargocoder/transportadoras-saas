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
import { CreateFuelStationModal } from '../../../features/fleet/create-fuel-station-modal';
import { listFuelStations } from '../../../lib/api/fuel.api';
import { FUEL_STATION_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import type { FuelStationEntity } from '../../../types/entities';

const PAGE_SIZE = 20;

export default function FuelStationsPage(): JSX.Element {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounce(search);

  const query = useQuery({
    queryKey: ['fuel-stations', { page, search: debouncedSearch }],
    queryFn: ({ signal }) =>
      listFuelStations({ page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined }, signal),
  });

  const columns = useMemo<ColumnDef<FuelStationEntity, unknown>[]>(
    () => [
      { header: 'Nome', accessorFn: (row) => row.name },
      {
        header: 'Cidade/UF',
        cell: ({ row }) =>
          row.original.city ? `${row.original.city}/${row.original.state ?? ''}` : '-',
      },
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
        title="Postos de combustível"
        description="Cadastro de postos utilizados nos abastecimentos."
        actions={
          hasRole(user?.role, FUEL_STATION_WRITE_ROLES) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Novo posto
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
        <FormField label="Buscar" htmlFor="station-search" className="w-full sm:w-64">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Nome do posto..."
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
          getRowId={(s) => s.id}
          emptyTitle="Nenhum posto cadastrado"
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreateFuelStationModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
