'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { DataTable } from '../../../../../components/ui/data-table';
import { DatePicker } from '../../../../../components/ui/date-picker';
import { EntitySelect } from '../../../../../components/ui/entity-select';
import { ErrorState } from '../../../../../components/ui/error-state';
import { FilterBar } from '../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../components/ui/form-field';
import { PageHeader } from '../../../../../components/ui/page-header';
import { Pagination } from '../../../../../components/ui/pagination';
import { Select } from '../../../../../components/ui/select';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { CreateReceivableModal } from '../../../../../features/receivables/create-receivable-modal';
import { ReceivableDetailModal } from '../../../../../features/receivables/receivable-detail-modal';
import { listCustomers } from '../../../../../lib/api/trips.api';
import { getReceivablesDashboard, listReceivables } from '../../../../../lib/api/receivables.api';
import { RECEIVABLE_STATUS_LABELS, RECEIVABLE_STATUS_TONE } from '../../../../../lib/labels';
import type { ReceivableEntity } from '../../../../../types/entities';
import type { ReceivableEffectiveStatus } from '../../../../../types/enums';
import { formatCurrency, formatDate } from '../../../../../utils/format';

const PAGE_SIZE = 20;
const STATUS_OPTIONS: ReceivableEffectiveStatus[] = ['OPEN', 'PARTIALLY_RECEIVED', 'OVERDUE', 'PAID', 'CANCELLED'];

export default function ReceivablesPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState<ReceivableEffectiveStatus | ''>('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const filters = {
    customerId: customerId || undefined,
    status: status || undefined,
    dueFrom: dueFrom || undefined,
    dueTo: dueTo || undefined,
  };
  const hasActiveFilters = Boolean(customerId || status || dueFrom || dueTo);

  const dashboardQuery = useQuery({
    queryKey: ['receivables', 'dashboard', { customerId }],
    queryFn: () => getReceivablesDashboard({ customerId: customerId || undefined }),
  });

  const listQuery = useQuery({
    queryKey: ['receivables', 'list', { page, ...filters }],
    queryFn: () => listReceivables({ page, pageSize: PAGE_SIZE, ...filters }),
  });

  const columns: ColumnDef<ReceivableEntity, unknown>[] = [
    { header: 'Cliente', accessorFn: (row) => row.customerName ?? 'Sem cliente' },
    { header: 'Viagem', cell: ({ row }) => row.original.tripLabel ?? row.original.tripId ?? 'Manual' },
    { header: 'Valor', cell: ({ row }) => formatCurrency(row.original.originalAmount) },
    { header: 'Recebido', cell: ({ row }) => formatCurrency(row.original.receivedAmount) },
    { header: 'Saldo', cell: ({ row }) => formatCurrency(row.original.balance) },
    { header: 'Vencimento', cell: ({ row }) => formatDate(row.original.dueDate) },
    {
      header: 'Status',
      cell: ({ row }) => (
        <Badge tone={RECEIVABLE_STATUS_TONE[row.original.status]}>{RECEIVABLE_STATUS_LABELS[row.original.status]}</Badge>
      ),
    },
    {
      header: 'Ações',
      cell: ({ row }) => (
        <Button size="sm" variant="outline" onClick={() => setSelectedId(row.original.id)}>
          Ver
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Contas a receber"
        description="Cobrança e acompanhamento dos títulos gerados a partir do faturamento das viagens, além de títulos manuais."
        actions={<Button onClick={() => setCreateOpen(true)}>Nova conta a receber</Button>}
      />

      {dashboardQuery.isLoading && <SkeletonCards count={4} />}
      {dashboardQuery.isError && <ErrorState onRetry={() => dashboardQuery.refetch()} />}
      {dashboardQuery.data && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Faturado" value={formatCurrency(dashboardQuery.data.summary.totalInvoiced)} />
          <StatCard label="Recebido" value={formatCurrency(dashboardQuery.data.summary.totalReceived)} tone="success" />
          <StatCard label="Em aberto" value={formatCurrency(dashboardQuery.data.summary.totalOpen)} tone="info" />
          <StatCard label="Vencido" value={formatCurrency(dashboardQuery.data.summary.totalOverdue)} tone="danger" />
        </div>
      )}

      {dashboardQuery.data && (
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <p className="border-b border-border px-4 py-3 text-sm font-medium text-ink">Aging (classificação por vencimento)</p>
            <ul className="divide-y divide-border">
              {dashboardQuery.data.aging.map((bucket) => (
                <li key={bucket.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-ink-muted">{bucket.label}</span>
                  <span className="font-medium text-ink">
                    {formatCurrency(bucket.amount)} <span className="text-xs text-ink-subtle">({bucket.count})</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <p className="border-b border-border px-4 py-3 text-sm font-medium text-ink">Por cliente</p>
            {dashboardQuery.data.byCustomer.length === 0 ? (
              <p className="px-4 py-4 text-sm text-ink-subtle">Nenhum título no escopo/filtro selecionado.</p>
            ) : (
              <ul className="divide-y divide-border">
                {dashboardQuery.data.byCustomer.slice(0, 8).map((c) => (
                  <li key={c.customerId ?? 'sem-cliente'} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="min-w-0 truncate text-ink">{c.customerName}</span>
                    <span className="shrink-0 text-ink-muted">
                      saldo <span className="font-medium text-ink">{formatCurrency(c.balance)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setCustomerId('');
          setStatus('');
          setDueFrom('');
          setDueTo('');
          setPage(1);
        }}
      >
        <FormField label="Cliente" htmlFor="receivables-customer" className="w-full sm:w-48">
          <EntitySelect
            id="receivables-customer"
            queryKey={['customers', 'select']}
            queryFn={() => listCustomers({ pageSize: 100 })}
            getOptionValue={(c) => c.id}
            getOptionLabel={(c) => c.name}
            value={customerId}
            onChange={(value) => {
              setCustomerId(value);
              setPage(1);
            }}
            placeholder="Todos"
          />
        </FormField>
        <FormField label="Status" htmlFor="receivables-status" className="w-full sm:w-44">
          <Select
            id="receivables-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ReceivableEffectiveStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {RECEIVABLE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Vencimento de" htmlFor="receivables-due-from" className="w-full sm:w-40">
          <DatePicker
            id="receivables-due-from"
            value={dueFrom}
            onChange={(e) => {
              setDueFrom(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Vencimento até" htmlFor="receivables-due-to" className="w-full sm:w-40">
          <DatePicker
            id="receivables-due-to"
            value={dueTo}
            onChange={(e) => {
              setDueTo(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={listQuery.data?.items ?? []}
          isLoading={listQuery.isLoading}
          isError={listQuery.isError}
          onRetry={() => listQuery.refetch()}
          getRowId={(r) => r.id}
          emptyTitle="Nenhuma conta a receber encontrada"
          emptyDescription="Gere um título a partir do faturamento de uma viagem (aba Financeiro da viagem)."
        />
        {listQuery.data && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
      </div>

      <ReceivableDetailModal open={selectedId !== null} onClose={() => setSelectedId(null)} receivableId={selectedId} />
      <CreateReceivableModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
