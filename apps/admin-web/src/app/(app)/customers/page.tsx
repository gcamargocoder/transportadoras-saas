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
import { CreateCustomerModal } from '../../../features/customers/create-customer-modal';
import { listCustomers } from '../../../lib/api/trips.api';
import { TRIP_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import type { CustomerEntity } from '../../../types/entities';

const PAGE_SIZE = 20;

export default function CustomersPage(): JSX.Element {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounce(search);

  const query = useQuery({
    queryKey: ['customers', { page, search: debouncedSearch }],
    queryFn: ({ signal }) =>
      listCustomers({ page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined }, signal),
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
        hasActiveFilters={Boolean(search)}
        onClear={() => {
          setSearch('');
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
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => query.refetch()}
          getRowId={(c) => c.id}
          emptyTitle="Nenhum cliente encontrado"
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreateCustomerModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
