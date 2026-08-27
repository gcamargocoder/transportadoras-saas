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
import { ProposalFormModal } from '../../../features/proposals/proposal-form-modal';
import { listProposals } from '../../../lib/api/proposals.api';
import { listCustomers } from '../../../lib/api/trips.api';
import { PROPOSAL_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_TONE, labelOrValue } from '../../../lib/labels';
import type { ProposalEntity } from '../../../types/entities';
import type { ProposalStatus } from '../../../types/enums';
import { formatCurrency, formatDate } from '../../../utils/format';

const PAGE_SIZE = 20;

export default function ProposalsPage(): JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProposalStatus | ''>('');
  const [customerId, setCustomerId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounce(search);

  const hasActiveFilters = Boolean(search || status || customerId || from || to);

  const query = useQuery({
    queryKey: ['proposals', { page, search: debouncedSearch, status, customerId, from, to }],
    queryFn: ({ signal }) =>
      listProposals(
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

  const columns = useMemo<ColumnDef<ProposalEntity, unknown>[]>(
    () => [
      { header: 'Nº', accessorFn: (row) => `#${row.number}`, size: 60 },
      { header: 'Cliente', accessorFn: (row) => row.customerName ?? '—' },
      { header: 'Valor total', cell: ({ row }) => formatCurrency(row.original.totalAmount) },
      {
        header: 'Status',
        cell: ({ row }) => <Badge tone={PROPOSAL_STATUS_TONE[row.original.status]}>{PROPOSAL_STATUS_LABELS[row.original.status]}</Badge>,
      },
      {
        header: 'Validade',
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span>{formatDate(row.original.validUntil)}</span>
            {row.original.expired && !['ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'].includes(row.original.status) && (
              <Badge tone="danger">Expirada</Badge>
            )}
          </div>
        ),
      },
      { header: 'Emitida em', cell: ({ row }) => formatDate(row.original.issuedAt) },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Propostas"
        description="Documentos comerciais formais emitidos para os clientes."
        actions={
          hasRole(user?.role, PROPOSAL_WRITE_ROLES) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Nova proposta
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
        <FormField label="Buscar" htmlFor="prop-search" className="w-full sm:w-64">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Número, cliente, condições..."
          />
        </FormField>
        <FormField label="Cliente" htmlFor="prop-filter-customer" className="w-full sm:w-56">
          <EntitySelect
            id="prop-filter-customer"
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
        <FormField label="Status" htmlFor="prop-filter-status" className="w-full sm:w-44">
          <Select
            id="prop-filter-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ProposalStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(PROPOSAL_STATUS_LABELS) as ProposalStatus[]).map((s) => (
              <option key={s} value={s}>
                {labelOrValue(PROPOSAL_STATUS_LABELS, s)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="De" htmlFor="prop-filter-from" className="w-full sm:w-40">
          <DatePicker
            id="prop-filter-from"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Até" htmlFor="prop-filter-to" className="w-full sm:w-40">
          <DatePicker
            id="prop-filter-to"
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
          getRowId={(p) => p.id}
          onRowClick={(p) => router.push(`/proposals/${p.id}`)}
          emptyTitle="Nenhuma proposta encontrada"
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <ProposalFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
