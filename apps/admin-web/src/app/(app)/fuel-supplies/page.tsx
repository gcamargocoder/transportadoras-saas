'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Droplets, Fuel, Gauge, Pencil, Plus, Route, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { DataTable } from '../../../components/ui/data-table';
import { DatePicker } from '../../../components/ui/date-picker';
import { EntitySelect } from '../../../components/ui/entity-select';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { SkeletonCards } from '../../../components/ui/skeleton';
import { StatCard } from '../../../components/ui/stat-card';
import { useToast } from '../../../components/ui/toast';
import { useAuth } from '../../../hooks/use-auth';
import { CreateFuelSupplyModal } from '../../../features/fuel/create-fuel-supply-modal';
import { UpdateFuelSupplyModal } from '../../../features/fuel/update-fuel-supply-modal';
import { tripSelectLabel } from '../../../features/tolls/trip-select-label';
import { toFriendlyMessage } from '../../../lib/api/errors';
import { deleteFuelSupply, getFuelDashboard, listFuelSupplies } from '../../../lib/api/fuel.api';
import { listTrips } from '../../../lib/api/trips.api';
import { FUEL_SUPPLY_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import { FUEL_TYPE_LABELS } from '../../../lib/labels';
import type { FuelSupplyEntity } from '../../../types/entities';
import { formatCurrency, formatDate, formatNumber } from '../../../utils/format';

const PAGE_SIZE = 20;

export default function FuelSuppliesPage(): JSX.Element {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [supplyDateFrom, setSupplyDateFrom] = useState('');
  const [supplyDateTo, setSupplyDateTo] = useState('');
  // Fase 107 -- filtro por viagem: o backend ja aceitava `tripId`
  // (FindFuelSuppliesQueryDto), so nao havia como selecioná-lo nesta tela.
  const [tripId, setTripId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FuelSupplyEntity | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FuelSupplyEntity | null>(null);
  const canWrite = hasRole(user?.role, FUEL_SUPPLY_WRITE_ROLES);

  const filters = {
    supplyDateFrom: supplyDateFrom || undefined,
    supplyDateTo: supplyDateTo || undefined,
    tripId: tripId || undefined,
  };

  const dashboardQuery = useQuery({
    queryKey: ['fuel-supplies', 'dashboard', filters],
    queryFn: ({ signal }) => getFuelDashboard(filters, signal),
  });

  const listQuery = useQuery({
    queryKey: ['fuel-supplies', 'list', { page, ...filters }],
    queryFn: ({ signal }) => listFuelSupplies({ page, pageSize: PAGE_SIZE, ...filters }, signal),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFuelSupply(id),
    onSuccess: () => {
      toast.success('Abastecimento excluído.');
      queryClient.invalidateQueries({ queryKey: ['fuel-supplies'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      setDeleteTarget(null);
    },
    onError: (error) => toast.error('Não foi possível excluir o abastecimento.', toFriendlyMessage(error)),
  });

  const columns = useMemo<ColumnDef<FuelSupplyEntity, unknown>[]>(
    () => [
      { header: 'Data', cell: ({ row }) => formatDate(row.original.supplyDate) },
      { header: 'Veículo', accessorFn: (row) => row.vehiclePlate ?? '-' },
      { header: 'Motorista', accessorFn: (row) => row.driverName ?? '-' },
      { header: 'Viagem', accessorFn: (row) => row.tripLabel ?? '—' },
      { header: 'Posto', accessorFn: (row) => row.fuelStationName ?? '-' },
      { header: 'Combustível', accessorFn: (row) => FUEL_TYPE_LABELS[row.fuelType] },
      { header: 'Litros', cell: ({ row }) => `${formatNumber(row.original.liters, 1)} L` },
      { header: 'Valor', cell: ({ row }) => formatCurrency(row.original.totalAmount) },
      ...(canWrite
        ? [
            {
              header: 'Ações',
              id: 'actions',
              cell: ({ row }: { row: { original: FuelSupplyEntity } }) => (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" title="Editar" onClick={() => setEditTarget(row.original)}>
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" title="Excluir" onClick={() => setDeleteTarget(row.original)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              ),
            },
          ]
        : []),
    ],
    [canWrite],
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
          <StatCard
            label="Custo por km"
            value={
              dashboardQuery.data.costPerKm !== null
                ? formatCurrency(dashboardQuery.data.costPerKm)
                : '-'
            }
            icon={Route}
          />
        </div>
      )}

      <FilterBar
        hasActiveFilters={Boolean(supplyDateFrom || supplyDateTo || tripId)}
        onClear={() => {
          setSupplyDateFrom('');
          setSupplyDateTo('');
          setTripId('');
          setPage(1);
        }}
      >
        <FormField label="Viagem" htmlFor="fuel-trip" className="w-full sm:w-56">
          <EntitySelect
            id="fuel-trip"
            queryKey={['trips', 'select']}
            queryFn={() => listTrips({ pageSize: 100 })}
            getOptionValue={(t) => t.id}
            getOptionLabel={tripSelectLabel}
            value={tripId}
            onChange={(value) => {
              setTripId(value);
              setPage(1);
            }}
            placeholder="Todas"
          />
        </FormField>
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

      {editTarget && (
        <UpdateFuelSupplyModal open={Boolean(editTarget)} onClose={() => setEditTarget(null)} supply={editTarget} />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Excluir abastecimento"
        description="Esta ação não pode ser desfeita. Deseja continuar?"
        confirmLabel="Excluir"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
