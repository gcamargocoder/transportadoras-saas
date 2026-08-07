'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { useAuth } from '../../../hooks/use-auth';
import { EntitySelect } from '../../../components/ui/entity-select';
import { CreateAdvanceModal } from '../../../features/financial/create-advance-modal';
import { listTripAdvances } from '../../../lib/api/financial.api';
import { listDrivers } from '../../../lib/api/drivers.api';
import { TRIP_ADVANCE_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import type { TripAdvanceEntity } from '../../../types/entities';
import { formatCurrency, formatDate } from '../../../utils/format';

const PAGE_SIZE = 20;

export default function AdvancesPage(): JSX.Element {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [driverId, setDriverId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ['trip-advances', { page, driverId }],
    queryFn: ({ signal }) =>
      listTripAdvances({ page, pageSize: PAGE_SIZE, driverId: driverId || undefined }, signal),
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
      <PageHeader
        title="Adiantamentos"
        description="Adiantamentos pagos a motoristas para despesas de viagem."
        actions={
          hasRole(user?.role, TRIP_ADVANCE_WRITE_ROLES) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Novo adiantamento
            </Button>
          )
        }
      />

      <FilterBar
        hasActiveFilters={Boolean(driverId)}
        onClear={() => {
          setDriverId('');
          setPage(1);
        }}
      >
        <FormField label="Motorista" htmlFor="advance-driver" className="w-full sm:w-56">
          <EntitySelect
            id="advance-driver"
            queryKey={['drivers', 'select']}
            queryFn={() => listDrivers({ pageSize: 100, isActive: true })}
            getOptionValue={(d) => d.id}
            getOptionLabel={(d) => d.name}
            value={driverId}
            onChange={(v) => {
              setDriverId(v);
              setPage(1);
            }}
            placeholder="Todos"
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
          getRowId={(a) => a.id}
          emptyTitle="Nenhum adiantamento encontrado"
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreateAdvanceModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
