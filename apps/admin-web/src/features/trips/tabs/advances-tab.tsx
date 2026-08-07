'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { useAuth } from '../../../hooks/use-auth';
import { CreateAdvanceModal } from '../../financial/create-advance-modal';
import { listTripAdvances } from '../../../lib/api/financial.api';
import { TRIP_ADVANCE_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import type { TripAdvanceEntity } from '../../../types/entities';
import { formatCurrency, formatDate } from '../../../utils/format';

export function AdvancesTab({ tripId }: { tripId: string }): JSX.Element {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ['trip-advances', { tripId }],
    queryFn: () => listTripAdvances({ tripId, pageSize: 50 }),
  });

  const columns = useMemo<ColumnDef<TripAdvanceEntity, unknown>[]>(
    () => [
      { header: 'Data', cell: ({ row }) => formatDate(row.original.paidAt) },
      { header: 'Motorista', accessorFn: (row) => row.driverName ?? '-' },
      { header: 'Descrição', accessorFn: (row) => row.description },
      { header: 'Valor', cell: ({ row }) => formatCurrency(row.original.amount) },
    ],
    [],
  );

  return (
    <div>
      {hasRole(user?.role, TRIP_ADVANCE_WRITE_ROLES) && (
        <div className="flex justify-end p-3">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            Novo adiantamento
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        getRowId={(a) => a.id}
        emptyTitle="Nenhum adiantamento registrado nesta viagem"
      />
      <CreateAdvanceModal open={createOpen} onClose={() => setCreateOpen(false)} tripId={tripId} />
    </div>
  );
}
