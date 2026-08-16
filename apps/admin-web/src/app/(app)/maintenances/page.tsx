'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { Select } from '../../../components/ui/select';
import { useAuth } from '../../../hooks/use-auth';
import { CreateMaintenanceModal } from '../../../features/fleet/create-maintenance-modal';
import { MAINTENANCE_STATUS_TONE } from '../../../features/fleet/status';
import { listMaintenances } from '../../../lib/api/fleet.api';
import { FLEET_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import { MAINTENANCE_COMPONENT_LABELS, MAINTENANCE_STATUS_LABELS, MAINTENANCE_TYPE_LABELS } from '../../../lib/labels';
import type { MaintenanceEntity } from '../../../types/entities';
import type { MaintenanceComponent, VehicleMaintenanceStatus } from '../../../types/enums';
import { formatCurrency, formatDate } from '../../../utils/format';

const PAGE_SIZE = 20;

export default function MaintenancesPage(): JSX.Element {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<VehicleMaintenanceStatus | ''>('');
  const [component, setComponent] = useState<MaintenanceComponent | ''>('');
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ['maintenances', { page, status, component }],
    queryFn: ({ signal }) =>
      listMaintenances({ page, pageSize: PAGE_SIZE, status: status || undefined, component: component || undefined }, signal),
  });

  const columns = useMemo<ColumnDef<MaintenanceEntity, unknown>[]>(
    () => [
      { header: 'Tipo', accessorFn: (row) => MAINTENANCE_TYPE_LABELS[row.type] },
      { header: 'Abertura', cell: ({ row }) => formatDate(row.original.openedAt) },
      { header: 'Componente', accessorFn: (row) => (row.component ? MAINTENANCE_COMPONENT_LABELS[row.component] : '-') },
      { header: 'Oficina', accessorFn: (row) => row.workshop ?? '-' },
      { header: 'Custo total', cell: ({ row }) => formatCurrency(row.original.totalCost) },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={MAINTENANCE_STATUS_TONE[row.original.status]}>
            {MAINTENANCE_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Manutenções"
        description="Ordens de manutenção da frota."
        actions={
          hasRole(user?.role, FLEET_WRITE_ROLES) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Nova manutenção
            </Button>
          )
        }
      />

      <FilterBar
        hasActiveFilters={Boolean(status || component)}
        onClear={() => {
          setStatus('');
          setComponent('');
          setPage(1);
        }}
      >
        <FormField label="Status" htmlFor="maint-status" className="w-full sm:w-48">
          <Select
            id="maint-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as VehicleMaintenanceStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(MAINTENANCE_STATUS_LABELS) as VehicleMaintenanceStatus[]).map((s) => (
              <option key={s} value={s}>
                {MAINTENANCE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Componente" htmlFor="maint-component" className="w-full sm:w-48">
          <Select
            id="maint-component"
            value={component}
            onChange={(e) => {
              setComponent(e.target.value as MaintenanceComponent | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(MAINTENANCE_COMPONENT_LABELS) as MaintenanceComponent[]).map((c) => (
              <option key={c} value={c}>
                {MAINTENANCE_COMPONENT_LABELS[c]}
              </option>
            ))}
          </Select>
        </FormField>
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => query.refetch()}
          getRowId={(m) => m.id}
          emptyTitle="Nenhuma manutenção encontrada"
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreateMaintenanceModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
