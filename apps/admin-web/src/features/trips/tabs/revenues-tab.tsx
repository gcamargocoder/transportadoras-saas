'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { useAuth } from '../../../hooks/use-auth';
import { CreateRevenueModal } from '../../financial/create-revenue-modal';
import { listTripRevenues } from '../../../lib/api/financial.api';
import { TRIP_REVENUE_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import { REVENUE_CATEGORY_LABELS } from '../../../lib/labels';
import type { TripRevenueEntity } from '../../../types/entities';
import { formatCurrency, formatDate } from '../../../utils/format';

export function RevenuesTab({ tripId }: { tripId: string }): JSX.Element {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ['trip-revenues', { tripId }],
    queryFn: () => listTripRevenues({ tripId, pageSize: 50 }),
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
      { header: 'Valor', cell: ({ row }) => formatCurrency(row.original.amount) },
    ],
    [],
  );

  return (
    <div>
      {hasRole(user?.role, TRIP_REVENUE_WRITE_ROLES) && (
        <div className="flex justify-end p-3">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            Nova receita
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        getRowId={(r) => r.id}
        emptyTitle="Nenhuma receita registrada nesta viagem"
      />
      <CreateRevenueModal open={createOpen} onClose={() => setCreateOpen(false)} tripId={tripId} />
    </div>
  );
}
