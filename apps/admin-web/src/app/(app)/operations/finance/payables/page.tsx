'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { DataTable } from '../../../../../components/ui/data-table';
import { DatePicker } from '../../../../../components/ui/date-picker';
import { ErrorState } from '../../../../../components/ui/error-state';
import { FilterBar } from '../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../components/ui/form-field';
import { PageHeader } from '../../../../../components/ui/page-header';
import { Pagination } from '../../../../../components/ui/pagination';
import { Select } from '../../../../../components/ui/select';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { PayableDetailModal } from '../../../../../features/payables/payable-detail-modal';
import { getPayablesDashboard, listPayables } from '../../../../../lib/api/payables.api';
import { EXPENSE_CATEGORY_LABELS, PAYABLE_STATUS_LABELS, PAYABLE_STATUS_TONE } from '../../../../../lib/labels';
import type { PayableEntity } from '../../../../../types/entities';
import type { ExpenseCategory, PayableEffectiveStatus } from '../../../../../types/enums';
import { formatCurrency, formatDate } from '../../../../../utils/format';

const PAGE_SIZE = 20;
const STATUS_OPTIONS: PayableEffectiveStatus[] = ['OPEN', 'PARTIALLY_PAID', 'OVERDUE', 'PAID', 'CANCELLED'];

export default function PayablesPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [status, setStatus] = useState<PayableEffectiveStatus | ''>('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filters = {
    category: category || undefined,
    status: status || undefined,
    dueFrom: dueFrom || undefined,
    dueTo: dueTo || undefined,
  };
  const hasActiveFilters = Boolean(category || status || dueFrom || dueTo);

  const dashboardQuery = useQuery({
    queryKey: ['payables', 'dashboard', {}],
    queryFn: () => getPayablesDashboard({}),
  });

  const listQuery = useQuery({
    queryKey: ['payables', 'list', { page, ...filters }],
    queryFn: () => listPayables({ page, pageSize: PAGE_SIZE, ...filters }),
  });

  const columns: ColumnDef<PayableEntity, unknown>[] = [
    { header: 'Descrição', accessorFn: (row) => row.description },
    { header: 'Fornecedor', accessorFn: (row) => row.supplierName ?? '—' },
    { header: 'Viagem', cell: ({ row }) => row.original.tripLabel ?? row.original.tripId },
    { header: 'Categoria', cell: ({ row }) => EXPENSE_CATEGORY_LABELS[row.original.category] },
    { header: 'Valor', cell: ({ row }) => formatCurrency(row.original.originalAmount) },
    { header: 'Pago', cell: ({ row }) => formatCurrency(row.original.paidAmount) },
    { header: 'Saldo', cell: ({ row }) => formatCurrency(row.original.balance) },
    { header: 'Vencimento', cell: ({ row }) => formatDate(row.original.dueDate) },
    {
      header: 'Status',
      cell: ({ row }) => <Badge tone={PAYABLE_STATUS_TONE[row.original.status]}>{PAYABLE_STATUS_LABELS[row.original.status]}</Badge>,
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
        title="Contas a pagar"
        description="Acompanhamento dos títulos gerados a partir das despesas aprovadas das viagens."
      />

      {dashboardQuery.isLoading && <SkeletonCards count={4} />}
      {dashboardQuery.isError && <ErrorState onRetry={() => dashboardQuery.refetch()} />}
      {dashboardQuery.data && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total a pagar" value={formatCurrency(dashboardQuery.data.summary.totalPayable)} />
          <StatCard label="Pago" value={formatCurrency(dashboardQuery.data.summary.totalPaid)} tone="success" />
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
            <p className="border-b border-border px-4 py-3 text-sm font-medium text-ink">Por categoria</p>
            {dashboardQuery.data.byCategory.length === 0 ? (
              <p className="px-4 py-4 text-sm text-ink-subtle">Nenhum título no escopo/filtro selecionado.</p>
            ) : (
              <ul className="divide-y divide-border">
                {dashboardQuery.data.byCategory.map((c) => (
                  <li key={c.category} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="min-w-0 truncate text-ink">{EXPENSE_CATEGORY_LABELS[c.category]}</span>
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
          setCategory('');
          setStatus('');
          setDueFrom('');
          setDueTo('');
          setPage(1);
        }}
      >
        <FormField label="Categoria" htmlFor="payables-category" className="w-full sm:w-44">
          <Select
            id="payables-category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as ExpenseCategory | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Status" htmlFor="payables-status" className="w-full sm:w-44">
          <Select
            id="payables-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as PayableEffectiveStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {PAYABLE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Vencimento de" htmlFor="payables-due-from" className="w-full sm:w-40">
          <DatePicker
            id="payables-due-from"
            value={dueFrom}
            onChange={(e) => {
              setDueFrom(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Vencimento até" htmlFor="payables-due-to" className="w-full sm:w-40">
          <DatePicker
            id="payables-due-to"
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
          emptyTitle="Nenhuma conta a pagar encontrada"
          emptyDescription="Gere um título a partir de uma despesa aprovada (aba Despesas da viagem)."
        />
        {listQuery.data && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
      </div>

      <PayableDetailModal open={selectedId !== null} onClose={() => setSelectedId(null)} payableId={selectedId} />
    </div>
  );
}
