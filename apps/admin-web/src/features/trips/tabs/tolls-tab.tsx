'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { useAuth } from '../../../hooks/use-auth';
import { AUDIT_VERDICT_LABELS, AUDIT_VERDICT_TONE } from '../../tolls/audit-verdict';
import { CreateTollModal } from '../../tolls/create-toll-modal';
import { listTollTransactions } from '../../../lib/api/tolls.api';
import { TOLL_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import type { TollTransactionEntity } from '../../../types/entities';
import { formatCurrency, formatDateTime } from '../../../utils/format';

export function TollsTab({ tripId }: { tripId: string }): JSX.Element {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ['toll-transactions', 'list', { tripId }],
    queryFn: () => listTollTransactions({ tripId, pageSize: 50 }),
  });

  const columns = useMemo<ColumnDef<TollTransactionEntity, unknown>[]>(
    () => [
      { header: 'Praça', accessorFn: (row) => row.tollPlazaName },
      { header: 'Data', cell: ({ row }) => formatDateTime(row.original.chargedAt) },
      { header: 'Cobrado', cell: ({ row }) => formatCurrency(row.original.chargedAmount) },
      {
        header: 'Esperado',
        cell: ({ row }) =>
          row.original.auditVerdict === 'UNVERIFIABLE'
            ? '-'
            : formatCurrency(row.original.expectedAmount),
      },
      {
        header: 'Conferência',
        cell: ({ row }) => (
          <Badge tone={AUDIT_VERDICT_TONE[row.original.auditVerdict]}>
            {AUDIT_VERDICT_LABELS[row.original.auditVerdict]}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      {hasRole(user?.role, TOLL_WRITE_ROLES) && (
        <div className="flex justify-end p-3">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            Registrar pedágio
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        getRowId={(t) => t.id}
        emptyTitle="Nenhum pedágio registrado nesta viagem"
      />
      <CreateTollModal open={createOpen} onClose={() => setCreateOpen(false)} tripId={tripId} />
    </div>
  );
}
