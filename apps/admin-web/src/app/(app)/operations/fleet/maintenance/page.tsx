'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Clock, Wrench } from 'lucide-react';
import { useMemo } from 'react';
import { Card, CardHeader } from '../../../../../components/ui/card';
import { DataTable } from '../../../../../components/ui/data-table';
import { ErrorState } from '../../../../../components/ui/error-state';
import { PageHeader } from '../../../../../components/ui/page-header';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { MonthlyChartCard } from '../../../../../features/dashboard/monthly-chart-card';
import { BarRankingChart } from '../../../../../features/fleet-operations/bar-ranking-chart';
import { FleetFilters } from '../../../../../features/fleet-operations/fleet-filters';
import { useFleetOperationsFilters } from '../../../../../features/fleet-operations/use-fleet-operations-filters';
import { getFleetOperationsMaintenance } from '../../../../../lib/api/fleet-operations.api';
import { MAINTENANCE_PRIORITY_LABELS, MAINTENANCE_TYPE_LABELS } from '../../../../../lib/labels';
import type {
  FleetMaintenancePriorityBreakdownEntity,
  FleetMaintenanceTypeBreakdownEntity,
  FleetMaintenanceWorkshopBreakdownEntity,
} from '../../../../../types/entities';
import { formatCurrency, formatNumber } from '../../../../../utils/format';

export default function FleetMaintenancePage(): JSX.Element {
  const { startDate, setStartDate, endDate, setEndDate, vehicleId, setVehicleId, fleetId, setFleetId, filters, hasActiveFilters, clear } =
    useFleetOperationsFilters();

  const query = useQuery({
    queryKey: ['fleet-operations', 'maintenance', filters],
    queryFn: ({ signal }) => getFleetOperationsMaintenance(filters, signal),
  });

  const typeColumns = useMemo<ColumnDef<FleetMaintenanceTypeBreakdownEntity, unknown>[]>(
    () => [
      { header: 'Tipo', accessorFn: (row) => MAINTENANCE_TYPE_LABELS[row.type] },
      { header: 'Quantidade', accessorFn: (row) => formatNumber(row.count) },
      { header: 'Custo', cell: ({ row }) => formatCurrency(row.original.cost) },
    ],
    [],
  );

  const priorityColumns = useMemo<ColumnDef<FleetMaintenancePriorityBreakdownEntity, unknown>[]>(
    () => [
      { header: 'Prioridade', accessorFn: (row) => MAINTENANCE_PRIORITY_LABELS[row.priority] },
      { header: 'Quantidade', accessorFn: (row) => formatNumber(row.count) },
    ],
    [],
  );

  const workshopColumns = useMemo<ColumnDef<FleetMaintenanceWorkshopBreakdownEntity, unknown>[]>(
    () => [
      { header: 'Oficina', accessorFn: (row) => row.workshop ?? 'Não informada' },
      { header: 'Quantidade', accessorFn: (row) => formatNumber(row.count) },
      { header: 'Custo', cell: ({ row }) => formatCurrency(row.original.cost) },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Manutenção da frota"
        description="Manutenções agrupadas por tipo, prioridade, oficina e veículo, com tempo médio de execução."
      />

      <FleetFilters
        idPrefix="fmaint"
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        vehicleId={vehicleId}
        onVehicleIdChange={setVehicleId}
        fleetId={fleetId}
        onFleetIdChange={setFleetId}
        hasActiveFilters={hasActiveFilters}
        onClear={clear}
      />

      {query.isLoading && <SkeletonCards count={4} />}
      {query.isError && <ErrorState onRetry={() => query.refetch()} />}

      {query.data && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total de manutenções" value={formatNumber(query.data.totalCount)} icon={Wrench} />
            <StatCard
              label="Em aberto"
              value={formatNumber(query.data.openCount)}
              tone={query.data.openCount > 0 ? 'warning' : 'success'}
            />
            <StatCard label="Concluídas" value={formatNumber(query.data.completedCount)} tone="success" />
            <StatCard label="Custo total" value={formatCurrency(query.data.totalCost)} />
            <StatCard
              label="Custo médio/ocorrência"
              value={query.data.averageCostPerOccurrence === null ? '—' : formatCurrency(query.data.averageCostPerOccurrence)}
            />
            <StatCard
              label="Duração média (concluídas)"
              value={query.data.averageDurationHours === null ? '—' : `${formatNumber(query.data.averageDurationHours, 1)} h`}
              icon={Clock}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Por tipo" />
              <DataTable columns={typeColumns} data={query.data.byType} emptyTitle="Sem manutenções no período/filtro." />
            </Card>
            <Card>
              <CardHeader title="Por prioridade" />
              <DataTable
                columns={priorityColumns}
                data={query.data.byPriority}
                emptyTitle="Sem manutenções no período/filtro."
              />
            </Card>
          </div>

          <Card>
            <CardHeader title="Por oficina" />
            <DataTable
              columns={workshopColumns}
              data={query.data.byWorkshop}
              emptyTitle="Sem manutenções no período/filtro."
            />
          </Card>

          <MonthlyChartCard title="Evolução mensal do custo de manutenção" data={query.data.monthlyTrend} color="#d97706" />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarRankingChart
              title="Top 5 veículos por custo de manutenção"
              data={query.data.topVehiclesByCost.map((v) => ({ label: v.plate, value: v.value }))}
              color="#d97706"
              emptyMessage="Nenhum veículo com manutenção no período/filtro selecionado."
            />
            <BarRankingChart
              title="Top 5 veículos por nº de manutenções"
              data={query.data.topVehiclesByCount.map((v) => ({ label: v.plate, value: v.value }))}
              color="#0891b2"
              valueFormatter={(v) => formatNumber(v)}
              emptyMessage="Nenhum veículo com manutenção no período/filtro selecionado."
            />
          </div>
        </div>
      )}
    </div>
  );
}
