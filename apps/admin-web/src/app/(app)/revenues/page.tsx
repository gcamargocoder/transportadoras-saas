'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { DatePicker } from '../../../components/ui/date-picker';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { Select } from '../../../components/ui/select';
import { useAuth } from '../../../hooks/use-auth';
import { CreateRevenueModal } from '../../../features/financial/create-revenue-modal';
import { listTripRevenues } from '../../../lib/api/financial.api';
import { TRIP_REVENUE_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import { REVENUE_CATEGORY_LABELS } from '../../../lib/labels';
import type { TripRevenueEntity } from '../../../types/entities';
import type { RevenueCategory } from '../../../types/enums';
import { formatCurrency, formatDate } from '../../../utils/format';

const PAGE_SIZE = 20;

export default function RevenuesPage(): JSX.Element {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<RevenueCategory | ''>('');
  const [receivedFrom, setReceivedFrom] = useState('');
  const [receivedTo, setReceivedTo] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const filters = {
    category: category || undefined,
    receivedFrom: receivedFrom || undefined,
    receivedTo: receivedTo || undefined,
  };

  const query = useQuery({
    queryKey: ['trip-revenues', { page, ...filters }],
    queryFn: ({ signal }) => listTripRevenues({ page, pageSize: PAGE_SIZE, ...filters }, signal),
  });

  const columns = useMemo<ColumnDef<TripRevenueEntity, unknown>[]>(
    () => [
      { header: 'Data', cell: ({ row }) => formatDate(row.original.receivedAt) },
      {
        header: 'Categoria',
        cell: ({ row }) => (
          <Badge tone="brand">{REVENUE_CATEGORY_LABELS[row.original.category]}</Badge>
        ),
      },
      { header: 'Descrição', accessorFn: (row) => row.description },
      { header: 'Cliente', accessorFn: (row) => row.customerName ?? '-' },
      { header: 'Valor', cell: ({ row }) => formatCurrency(row.original.amount) },
    ],
    [],
  );

  const hasActiveFilters = Boolean(category || receivedFrom || receivedTo);

  return (
    <div>
      <PageHeader
        title="Receitas"
        description="Receitas registradas nas viagens."
        actions={
          hasRole(user?.role, TRIP_REVENUE_WRITE_ROLES) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Nova receita
            </Button>
          )
        }
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setCategory('');
          setReceivedFrom('');
          setReceivedTo('');
          setPage(1);
        }}
      >
        <FormField label="Categoria" htmlFor="revenue-category" className="w-full sm:w-44">
          <Select
            id="revenue-category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as RevenueCategory | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {(Object.keys(REVENUE_CATEGORY_LABELS) as RevenueCategory[]).map((c) => (
              <option key={c} value={c}>
                {REVENUE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="De" htmlFor="revenue-from" className="w-full sm:w-40">
          <DatePicker
            id="revenue-from"
            value={receivedFrom}
            onChange={(e) => {
              setReceivedFrom(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Até" htmlFor="revenue-to" className="w-full sm:w-40">
          <DatePicker
            id="revenue-to"
            value={receivedTo}
            onChange={(e) => {
              setReceivedTo(e.target.value);
              setPage(1);
            }}
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
          getRowId={(r) => r.id}
          emptyTitle="Nenhuma receita encontrada"
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreateRevenueModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
