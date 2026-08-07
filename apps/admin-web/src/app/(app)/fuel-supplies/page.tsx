'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Droplets, Fuel, Gauge, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { DatePicker } from '../../../components/ui/date-picker';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { SkeletonCards } from '../../../components/ui/skeleton';
import { StatCard } from '../../../components/ui/stat-card';
import { useAuth } from '../../../hooks/use-auth';
import { CreateFuelSupplyModal } from '../../../features/fuel/create-fuel-supply-modal';
import { getFuelDashboard, listFuelSupplies } from '../../../lib/api/fuel.api';
import { FUEL_SUPPLY_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import { FUEL_TYPE_LABELS } from '../../../lib/labels';
import type { FuelSupplyEntity } from '../../../types/entities';
import { formatCurrency, formatDate, formatNumber } from '../../../utils/format';

const PAGE_SIZE = 20;

export default function FuelSuppliesPage(): JSX.Element {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [supplyDateFrom, setSupplyDateFrom] = useState('');
  const [supplyDateTo, setSupplyDateTo] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const filters = {
    supplyDateFrom: supplyDateFrom || undefined,
    supplyDateTo: supplyDateTo || undefined,
  };

  const dashboardQuery = useQuery({
    queryKey: ['fuel-supplies', 'dashboard', filters],
    queryFn: ({ signal }) => getFuelDashboard(filters, signal),
  });

  const listQuery = useQuery({
    queryKey: ['fuel-supplies', 'list', { page, ...filters }],
    queryFn: ({ signal }) => listFuelSupplies({ page, pageSize: PAGE_SIZE, ...filters }, signal),
  });

  const columns = useMemo<ColumnDef<FuelSupplyEntity, unknown>[]>(
    () => [
      { header: 'Data', cell: ({ row }) => formatDate(row.original.supplyDate) },
      { header: 'Veículo', accessorFn: (row) => row.vehiclePlate ?? '-' },
      { header: 'Motorista', accessorFn: (row) => row.driverName ?? '-' },
      { header: 'Posto', accessorFn: (row) => row.fuelStationName ?? '-' },
      { header: 'Combustível', accessorFn: (row) => FUEL_TYPE_LABELS[row.fuelType] },
      { header: 'Litros', cell: ({ row }) => `${formatNumber(row.original.liters, 1)} L` },
      { header: 'Valor', cell: ({ row }) => formatCurrency(row.original.totalAmount) },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Abastecimentos"
        description="Histórico de abastecimentos da frota."
        actions={
          hasRole(user?.role, FUEL_SUPPLY_WRITE_ROLES) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Novo abastecimento
            </Button>
          )
        }
      />

      {dashboardQuery.isLoading && <SkeletonCards />}
      {dashboardQuery.data && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Abastecimentos"
            value={String(dashboardQuery.data.suppliesCount)}
            icon={Fuel}
          />
          <StatCard
            label="Litros totais"
            value={`${formatNumber(dashboardQuery.data.totalLiters, 1)} L`}
            icon={Droplets}
          />
          <StatCard label="Valor total" value={formatCurrency(dashboardQuery.data.totalAmount)} />
          <StatCard
            label="Consumo médio"
            value={
              dashboardQuery.data.averageConsumptionKmL
                ? `${formatNumber(dashboardQuery.data.averageConsumptionKmL, 1)} km/L`
                : '-'
            }
            icon={Gauge}
          />
        </div>
      )}

      <FilterBar
        hasActiveFilters={Boolean(supplyDateFrom || supplyDateTo)}
        onClear={() => {
          setSupplyDateFrom('');
          setSupplyDateTo('');
          setPage(1);
        }}
      >
        <FormField label="De" htmlFor="fuel-from" className="w-full sm:w-40">
          <DatePicker
            id="fuel-from"
            value={supplyDateFrom}
            onChange={(e) => {
              setSupplyDateFrom(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Até" htmlFor="fuel-to" className="w-full sm:w-40">
          <DatePicker
            id="fuel-to"
            value={supplyDateTo}
            onChange={(e) => {
              setSupplyDateTo(e.target.value);
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
          getRowId={(s) => s.id}
          emptyTitle="Nenhum abastecimento encontrado"
        />
        {listQuery.data && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
      </div>

      <CreateFuelSupplyModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
