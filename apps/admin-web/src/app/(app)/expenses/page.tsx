'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, MoreHorizontal, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { DatePicker } from '../../../components/ui/date-picker';
import { Dropdown } from '../../../components/ui/dropdown';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { Select } from '../../../components/ui/select';
import { useToast } from '../../../components/ui/toast';
import { useAuth } from '../../../hooks/use-auth';
import { CreateExpenseModal } from '../../../features/financial/create-expense-modal';
import { EXPENSE_STATUS_TONE } from '../../../features/financial/status';
import { toFriendlyMessage } from '../../../lib/api/errors';
import { listTripExpenses, updateTripExpenseStatus } from '../../../lib/api/financial.api';
import {
  TRIP_EXPENSE_APPROVAL_ROLES,
  TRIP_EXPENSE_WRITE_ROLES,
  hasRole,
} from '../../../lib/auth/roles';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_STATUS_LABELS } from '../../../lib/labels';
import type { TripExpenseEntity } from '../../../types/entities';
import type { ExpenseCategory, ExpenseStatus } from '../../../types/enums';
import { formatCurrency, formatDate } from '../../../utils/format';

const PAGE_SIZE = 20;

export default function ExpensesPage(): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ExpenseStatus | ''>('');
  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [expenseDateFrom, setExpenseDateFrom] = useState('');
  const [expenseDateTo, setExpenseDateTo] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const filters = {
    status: status || undefined,
    category: category || undefined,
    expenseDateFrom: expenseDateFrom || undefined,
    expenseDateTo: expenseDateTo || undefined,
  };

  const query = useQuery({
    queryKey: ['trip-expenses', { page, ...filters }],
    queryFn: ({ signal }) => listTripExpenses({ page, pageSize: PAGE_SIZE, ...filters }, signal),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: ExpenseStatus }) =>
      updateTripExpenseStatus(id, next),
    onSuccess: () => {
      toast.success('Status da despesa atualizado.');
      queryClient.invalidateQueries({ queryKey: ['trip-expenses'] });
    },
    onError: (error) =>
      toast.error('Não foi possível atualizar o status.', toFriendlyMessage(error)),
  });

  const canApprove = hasRole(user?.role, TRIP_EXPENSE_APPROVAL_ROLES);

  const columns = useMemo<ColumnDef<TripExpenseEntity, unknown>[]>(
    () => [
      { header: 'Data', cell: ({ row }) => formatDate(row.original.expenseDate) },
      { header: 'Categoria', accessorFn: (row) => EXPENSE_CATEGORY_LABELS[row.category] },
      { header: 'Descrição', accessorFn: (row) => row.description },
      { header: 'Valor', cell: ({ row }) => formatCurrency(row.original.amount) },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={EXPENSE_STATUS_TONE[row.original.status]}>
            {EXPENSE_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      ...(canApprove
        ? [
            {
              id: 'actions',
              header: '',
              cell: ({ row }: { row: { original: TripExpenseEntity } }) =>
                row.original.status === 'PENDING' ? (
                  <Dropdown
                    trigger={
                      <span className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-muted hover:text-ink">
                        <MoreHorizontal size={16} />
                      </span>
                    }
                    items={[
                      {
                        label: 'Aprovar',
                        icon: <Check size={14} />,
                        onClick: () =>
                          statusMutation.mutate({ id: row.original.id, next: 'APPROVED' }),
                      },
                      {
                        label: 'Rejeitar',
                        icon: <X size={14} />,
                        danger: true,
                        onClick: () =>
                          statusMutation.mutate({ id: row.original.id, next: 'REJECTED' }),
                      },
                    ]}
                  />
                ) : null,
            } satisfies ColumnDef<TripExpenseEntity, unknown>,
          ]
        : []),
    ],
    [canApprove, statusMutation],
  );

  const hasActiveFilters = Boolean(status || category || expenseDateFrom || expenseDateTo);

  return (
    <div>
      <PageHeader
        title="Despesas"
        description="Despesas registradas nas viagens, com fluxo de aprovação."
        actions={
          hasRole(user?.role, TRIP_EXPENSE_WRITE_ROLES) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Nova despesa
            </Button>
          )
        }
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setStatus('');
          setCategory('');
          setExpenseDateFrom('');
          setExpenseDateTo('');
          setPage(1);
        }}
      >
        <FormField label="Status" htmlFor="expense-status" className="w-full sm:w-44">
          <Select
            id="expense-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ExpenseStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(EXPENSE_STATUS_LABELS) as ExpenseStatus[]).map((s) => (
              <option key={s} value={s}>
                {EXPENSE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Categoria" htmlFor="expense-category" className="w-full sm:w-44">
          <Select
            id="expense-category"
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
        <FormField label="De" htmlFor="expense-from" className="w-full sm:w-40">
          <DatePicker
            id="expense-from"
            value={expenseDateFrom}
            onChange={(e) => {
              setExpenseDateFrom(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Até" htmlFor="expense-to" className="w-full sm:w-40">
          <DatePicker
            id="expense-to"
            value={expenseDateTo}
            onChange={(e) => {
              setExpenseDateTo(e.target.value);
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
          getRowId={(e) => e.id}
          emptyTitle="Nenhuma despesa encontrada"
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreateExpenseModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
