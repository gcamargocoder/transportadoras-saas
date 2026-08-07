'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { useAuth } from '../../../hooks/use-auth';
import { CreateTollModal } from '../../tolls/create-toll-modal';
import { TOLL_STATUS_TONE } from '../../tolls/status';
import { listTollTransactions } from '../../../lib/api/tolls.api';
import { TOLL_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import { TOLL_STATUS_LABELS } from '../../../lib/labels';
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
      { header: 'Esperado', cell: ({ row }) => formatCurrency(row.original.expectedAmount) },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={TOLL_STATUS_TONE[row.original.status]}>
            {TOLL_STATUS_LABELS[row.original.status]}
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
