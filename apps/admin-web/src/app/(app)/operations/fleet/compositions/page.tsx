'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CircleDot, Container, Info, Route as RouteIcon } from 'lucide-react';
import Link from 'next/link';
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
import { getFleetOperationsCompositions } from '../../../../../lib/api/fleet-operations.api';
import { TRAILER_TYPE_LABELS } from '../../../../../lib/labels';
import type { FleetTrailerDowntimeEntity } from '../../../../../types/entities';
import { formatNumber } from '../../../../../utils/format';

export default function FleetCompositionsPage(): JSX.Element {
  const { startDate, setStartDate, endDate, setEndDate, vehicleId, setVehicleId, fleetId, setFleetId, filters, hasActiveFilters, clear } =
    useFleetOperationsFilters();

  const query = useQuery({
    queryKey: ['fleet-operations', 'compositions', filters],
    queryFn: ({ signal }) => getFleetOperationsCompositions(filters, signal),
  });

  const trailerColumns = useMemo<ColumnDef<FleetTrailerDowntimeEntity, unknown>[]>(
    () => [
      { header: 'Placa', accessorFn: (row) => row.plate },
      { header: 'Tipo', accessorFn: (row) => TRAILER_TYPE_LABELS[row.type] },
      { header: 'Viagens concluídas', accessorFn: (row) => formatNumber(row.tripCount) },
      { header: 'Tempo em uso', accessorFn: (row) => `${formatNumber(row.inUseMinutes)} min` },
      { header: 'Tempo parado', accessorFn: (row) => `${formatNumber(row.downtimeMinutes)} min` },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Composição — veículo e carreta"
        description="Uso de veículo+carreta por viagem: configuração de eixos, ranking de carretas e tempo parado vs. tempo em uso."
      />

      <FleetFilters
        idPrefix="fcomp"
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

      <Card className="mb-6">
        <div className="flex items-start gap-3 p-5 text-sm text-ink-muted">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p>
            <strong className="text-ink">Limitações conhecidas:</strong> tempo parado por carreta só cobre paradas
            vinculadas a uma viagem (nunca paradas administrativas/de pátio sem viagem associada) e sempre reflete a
            composição <strong>atual</strong> da viagem — troca de carreta no meio do trajeto não é reconstruída
            historicamente. Composições com mais de uma carreta (bitrem/rodotrem) atribuem a duração{' '}
            <strong>inteira</strong> a cada carreta, nunca dividida entre elas. Sem estimativa de receita perdida por
            carreta — ratear a receita da viagem entre carretas de uma mesma composição seria uma alocação inventada.
          </p>
        </div>
      </Card>

      {query.isLoading && <SkeletonCards count={4} />}
      {query.isError && <ErrorState onRetry={() => query.refetch()} />}

      {query.data && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total de carretas" value={formatNumber(query.data.totalTrailers)} icon={Container} variant="gradient" />
            <StatCard label="Ativas" value={formatNumber(query.data.activeCount)} tone="success" icon={CircleDot} />
            <StatCard label="Em viagem" value={formatNumber(query.data.trailersOnTrip)} icon={RouteIcon} tone="info" />
            <StatCard label="Disponíveis" value={formatNumber(query.data.trailersAvailable)} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarRankingChart
              title="Por tipo"
              data={query.data.byType.map((t) => ({ label: TRAILER_TYPE_LABELS[t.type], value: t.count }))}
              valueFormatter={(v) => formatNumber(v)}
              emptyMessage="Nenhuma carreta no filtro selecionado."
            />
            <BarRankingChart
              title="Por configuração de eixos"
              data={query.data.axleCategoryBreakdown.map((a) => ({ label: a.billableCategory, value: a.count }))}
              color="#0891b2"
              valueFormatter={(v) => formatNumber(v)}
              emptyMessage="Nenhuma viagem com composição de eixos cadastrada no período/filtro selecionado."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarRankingChart
              title="Carretas mais utilizadas"
              data={query.data.topTrailersByTripCount.map((t) => ({ label: t.plate, value: t.count }))}
              color="#7c3aed"
              valueFormatter={(v) => formatNumber(v)}
              emptyMessage="Nenhuma viagem concluída com carreta no período/filtro selecionado."
            />
            <BarRankingChart
              title="Carretas com mais tempo em uso"
              data={query.data.topTrailersByInUseMinutes.map((t) => ({ label: t.plate, value: t.value }))}
              color="#dc2626"
              valueFormatter={(v) => `${formatNumber(v)} min`}
              emptyMessage="Nenhuma viagem concluída com carreta no período/filtro selecionado."
            />
          </div>

          <Card>
            <CardHeader
              title="Tempo parado vs. em uso por carreta"
              description="Tempo em uso soma a duração real das viagens concluídas; tempo parado só cobre paradas vinculadas a uma viagem."
            />
            <DataTable columns={trailerColumns} data={query.data.trailers} emptyTitle="Nenhuma carreta com viagem ou parada no período/filtro selecionado." />
          </Card>

          <MonthlyChartCard
            title="Evolução mensal de viagens com carreta"
            data={query.data.monthlyTrendTripCount}
            color="#4f46e5"
            valueFormatter={(v) => formatNumber(v)}
          />

          <div className="flex justify-end">
            <Link href="/trailers" className="text-sm font-medium text-brand-600 hover:underline">
              Ver todas as carretas →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
