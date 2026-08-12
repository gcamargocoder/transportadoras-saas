'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Clock, ParkingSquare } from 'lucide-react';
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
import { getFleetOperationsStops } from '../../../../../lib/api/fleet-operations.api';
import { TRIP_STOP_TYPE_LABELS } from '../../../../../lib/labels';
import type { FleetStopsTypeBreakdownEntity } from '../../../../../types/entities';
import { formatNumber } from '../../../../../utils/format';

export default function FleetStopsPage(): JSX.Element {
  const { startDate, setStartDate, endDate, setEndDate, vehicleId, setVehicleId, fleetId, setFleetId, filters, hasActiveFilters, clear } =
    useFleetOperationsFilters();

  const query = useQuery({
    queryKey: ['fleet-operations', 'stops', filters],
    queryFn: ({ signal }) => getFleetOperationsStops(filters, signal),
  });

  const typeColumns = useMemo<ColumnDef<FleetStopsTypeBreakdownEntity, unknown>[]>(
    () => [
      { header: 'Tipo', accessorFn: (row) => TRIP_STOP_TYPE_LABELS[row.type] },
      { header: 'Quantidade', accessorFn: (row) => formatNumber(row.count) },
      { header: 'Duração total', accessorFn: (row) => `${formatNumber(row.totalDurationMinutes)} min` },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Paradas e ociosidade da frota"
        description="Paradas registradas pelo app do motorista, agrupadas por tipo e por veículo."
      />

      <FleetFilters
        idPrefix="fstop"
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
            <StatCard label="Total de paradas" value={formatNumber(query.data.totalStops)} icon={ParkingSquare} />
            <StatCard label="Duração total" value={`${formatNumber(query.data.totalDurationMinutes)} min`} />
            <StatCard
              label="Duração média"
              value={query.data.averageDurationMinutes === null ? '—' : `${formatNumber(query.data.averageDurationMinutes, 1)} min`}
              icon={Clock}
            />
          </div>

          <Card>
            <CardHeader title="Por tipo de parada" />
            <DataTable columns={typeColumns} data={query.data.byType} emptyTitle="Sem paradas no período/filtro." />
          </Card>

          <MonthlyChartCard
            title="Evolução mensal da quantidade de paradas"
            data={query.data.monthlyTrend}
            color="#0891b2"
            valueFormatter={(v) => formatNumber(v)}
          />

          <BarRankingChart
            title="Top 5 veículos por tempo parado"
            data={query.data.topVehiclesByDuration.map((v) => ({ label: v.plate, value: v.value }))}
            color="#0891b2"
            valueFormatter={(v) => `${formatNumber(v)} min`}
            emptyMessage="Nenhum veículo com parada registrada no período/filtro selecionado."
          />
        </div>
      )}
    </div>
  );
}
