'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { DatePicker } from '../../../components/ui/date-picker';
import { EntitySelect } from '../../../components/ui/entity-select';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { Select } from '../../../components/ui/select';
import { SearchInput } from '../../../components/ui/search-input';
import { useAuth } from '../../../hooks/use-auth';
import { useDebounce } from '../../../hooks/use-debounce';
import { QuotationFormModal } from '../../../features/quotations/quotation-form-modal';
import { listQuotations } from '../../../lib/api/quotations.api';
import { listCustomers } from '../../../lib/api/trips.api';
import { QUOTATION_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import { QUOTATION_STATUS_LABELS, QUOTATION_STATUS_TONE, labelOrValue } from '../../../lib/labels';
import type { QuotationEntity } from '../../../types/entities';
import type { QuotationStatus } from '../../../types/enums';
import { formatCurrency, formatDate } from '../../../utils/format';

const PAGE_SIZE = 20;

export default function QuotationsPage(): JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<QuotationStatus | ''>('');
  const [customerId, setCustomerId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounce(search);

  const hasActiveFilters = Boolean(search || status || customerId || from || to);

  const query = useQuery({
    queryKey: ['quotations', { page, search: debouncedSearch, status, customerId, from, to }],
    queryFn: ({ signal }) =>
      listQuotations(
        {
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          status: status || undefined,
          customerId: customerId || undefined,
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(to).toISOString() : undefined,
        },
        signal,
      ),
  });

  const columns = useMemo<ColumnDef<QuotationEntity, unknown>[]>(
    () => [
      { header: 'Cliente', accessorFn: (row) => row.customerName ?? '—' },
      {
        header: 'Origem → Destino',
        cell: ({ row }) => (
          <span className="truncate">
            {row.original.originLocationName ?? '—'} → {row.original.destinationLocationName ?? '—'}
          </span>
        ),
      },
      { header: 'Carga', accessorFn: (row) => row.cargoType ?? '—' },
      {
        header: 'Valor',
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{formatCurrency(row.original.amount)}</div>
            <div className="text-xs text-ink-subtle">
              {row.original.amountSource === 'CALCULATED' ? 'Calculado' : 'Manual'}
            </div>
          </div>
        ),
      },
      {
        header: 'Status',
        cell: ({ row }) => <Badge tone={QUOTATION_STATUS_TONE[row.original.status]}>{QUOTATION_STATUS_LABELS[row.original.status]}</Badge>,
      },
      {
        header: 'Validade',
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span>{formatDate(row.original.validUntil)}</span>
            {row.original.expired && !['CONVERTED', 'REJECTED', 'CANCELLED'].includes(row.original.status) && (
              <Badge tone="danger">Expirada</Badge>
            )}
          </div>
        ),
      },
      { header: 'Criada em', cell: ({ row }) => formatDate(row.original.createdAt) },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Cotações"
        description="Solicitações de transporte registradas pelos clientes."
        actions={
          hasRole(user?.role, QUOTATION_WRITE_ROLES) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Nova cotação
            </Button>
          )
        }
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setSearch('');
          setStatus('');
          setCustomerId('');
          setFrom('');
          setTo('');
          setPage(1);
        }}
      >
        <FormField label="Buscar" htmlFor="quo-search" className="w-full sm:w-64">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Cliente, carga, condições..."
          />
        </FormField>
        <FormField label="Cliente" htmlFor="quo-filter-customer" className="w-full sm:w-56">
          <EntitySelect
            id="quo-filter-customer"
            queryKey={['customers', 'select']}
            queryFn={() => listCustomers({ pageSize: 100 })}
            getOptionValue={(c) => c.id}
            getOptionLabel={(c) => c.name}
            value={customerId}
            onChange={(v) => {
              setCustomerId(v);
              setPage(1);
            }}
            placeholder="Todos"
          />
        </FormField>
        <FormField label="Status" htmlFor="quo-filter-status" className="w-full sm:w-44">
          <Select
            id="quo-filter-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as QuotationStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(QUOTATION_STATUS_LABELS) as QuotationStatus[]).map((s) => (
              <option key={s} value={s}>
                {labelOrValue(QUOTATION_STATUS_LABELS, s)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="De" htmlFor="quo-filter-from" className="w-full sm:w-40">
          <DatePicker
            id="quo-filter-from"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Até" htmlFor="quo-filter-to" className="w-full sm:w-40">
          <DatePicker
            id="quo-filter-to"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
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
          getRowId={(q) => q.id}
          onRowClick={(q) => router.push(`/quotations/${q.id}`)}
          emptyTitle="Nenhuma cotação encontrada"
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <QuotationFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
