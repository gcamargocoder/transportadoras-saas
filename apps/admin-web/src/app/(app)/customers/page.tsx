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
import { CustomerFormModal } from '../../../features/customers/customer-form-modal';
import { listCustomers } from '../../../lib/api/trips.api';
import { TRIP_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import type { CustomerEntity } from '../../../types/entities';

const PAGE_SIZE = 20;

type ActiveFilter = 'all' | 'active' | 'inactive';

export default function CustomersPage(): JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounce(search);

  const isActive = activeFilter === 'all' ? undefined : activeFilter === 'active';

  const query = useQuery({
    queryKey: ['customers', { page, search: debouncedSearch, isActive }],
    queryFn: ({ signal }) =>
      listCustomers({ page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined, isActive }, signal),
  });

  const columns = useMemo<ColumnDef<CustomerEntity, unknown>[]>(
    () => [
      { header: 'Nome', accessorFn: (row) => row.name },
      { header: 'Documento', accessorFn: (row) => row.document ?? '-' },
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
        title="Clientes"
        description="Clientes atendidos nas viagens e receitas."
        actions={
          hasRole(user?.role, TRIP_WRITE_ROLES) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Novo cliente
            </Button>
          )
        }
      />

      <FilterBar
        hasActiveFilters={Boolean(search) || activeFilter !== 'all'}
        onClear={() => {
          setSearch('');
          setActiveFilter('all');
          setPage(1);
        }}
      >
        <FormField label="Buscar" htmlFor="customer-search" className="w-full sm:w-64">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Nome do cliente..."
          />
        </FormField>
        <FormField label="Status" htmlFor="customer-active-filter" className="w-full sm:w-40">
          <Select
            id="customer-active-filter"
            value={activeFilter}
            onChange={(e) => {
              setActiveFilter(e.target.value as ActiveFilter);
              setPage(1);
            }}
          >
            <option value="all">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
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
          getRowId={(c) => c.id}
          onRowClick={(c) => router.push(`/customers/${c.id}`)}
          emptyTitle="Nenhum cliente encontrado"
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CustomerFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
