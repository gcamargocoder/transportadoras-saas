'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, FileText, MoreHorizontal, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { Dropdown } from '../../../components/ui/dropdown';
import { useToast } from '../../../components/ui/toast';
import { useAuth } from '../../../hooks/use-auth';
import { GeneratePayableModal } from '../../payables/generate-payable-modal';
import { CreateExpenseModal } from '../../financial/create-expense-modal';
import { EXPENSE_STATUS_TONE } from '../../financial/status';
import { toFriendlyMessage } from '../../../lib/api/errors';
import { listTripExpenses, updateTripExpenseStatus } from '../../../lib/api/financial.api';
import {
  PAYABLE_WRITE_ROLES,
  TRIP_EXPENSE_APPROVAL_ROLES,
  TRIP_EXPENSE_WRITE_ROLES,
  hasRole,
} from '../../../lib/auth/roles';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_STATUS_LABELS } from '../../../lib/labels';
import type { TripExpenseEntity } from '../../../types/entities';
import type { ExpenseStatus } from '../../../types/enums';
import { formatCurrency, formatDate } from '../../../utils/format';

export function ExpensesTab({ tripId }: { tripId: string }): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [payableExpenseId, setPayableExpenseId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['trip-expenses', { tripId }],
    queryFn: () => listTripExpenses({ tripId, pageSize: 50 }),
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
  // Fase 73 -- gerar conta a pagar a partir de uma despesa APPROVED.
  const canGeneratePayable = hasRole(user?.role, PAYABLE_WRITE_ROLES);
  const showActionsColumn = canApprove || canGeneratePayable;

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
      ...(showActionsColumn
        ? [
            {
              id: 'actions',
              header: '',
              cell: ({ row }: { row: { original: TripExpenseEntity } }) => {
                const items: { label: string; icon: JSX.Element; onClick: () => void; danger?: boolean }[] = [];
                if (canApprove && row.original.status === 'PENDING') {
                  items.push(
                    {
                      label: 'Aprovar',
                      icon: <Check size={14} />,
                      onClick: () => statusMutation.mutate({ id: row.original.id, next: 'APPROVED' as ExpenseStatus }),
                    },
                    {
                      label: 'Rejeitar',
                      icon: <X size={14} />,
                      danger: true,
                      onClick: () => statusMutation.mutate({ id: row.original.id, next: 'REJECTED' as ExpenseStatus }),
                    },
                  );
                }
                if (canGeneratePayable && row.original.status === 'APPROVED') {
                  items.push({
                    label: 'Gerar conta a pagar',
                    icon: <FileText size={14} />,
                    onClick: () => setPayableExpenseId(row.original.id),
                  });
                }
                return items.length > 0 ? (
                  <Dropdown
                    trigger={
                      <span className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-muted hover:text-ink">
                        <MoreHorizontal size={16} />
                      </span>
                    }
                    items={items}
                  />
                ) : null;
              },
            } satisfies ColumnDef<TripExpenseEntity, unknown>,
          ]
        : []),
    ],
    [canApprove, canGeneratePayable, showActionsColumn, statusMutation],
  );

  return (
    <div>
      {hasRole(user?.role, TRIP_EXPENSE_WRITE_ROLES) && (
        <div className="flex justify-end p-3">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            Nova despesa
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        getRowId={(e) => e.id}
        emptyTitle="Nenhuma despesa registrada nesta viagem"
      />
      <CreateExpenseModal open={createOpen} onClose={() => setCreateOpen(false)} tripId={tripId} />
      {payableExpenseId && (
        <GeneratePayableModal open onClose={() => setPayableExpenseId(null)} expenseId={payableExpenseId} />
      )}
    </div>
  );
}
