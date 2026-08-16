'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Info, ShieldAlert, Timer, Wallet } from 'lucide-react';
import { useMemo } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Card, CardHeader } from '../../../../../components/ui/card';
import { DataTable } from '../../../../../components/ui/data-table';
import { ErrorState } from '../../../../../components/ui/error-state';
import { PageHeader } from '../../../../../components/ui/page-header';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { MonthlyChartCard } from '../../../../../features/dashboard/monthly-chart-card';
import { BarRankingChart } from '../../../../../features/fleet-operations/bar-ranking-chart';
import { FleetFilters } from '../../../../../features/fleet-operations/fleet-filters';
import { RankingCard } from '../../../../../features/fleet-operations/ranking-card';
import { useFleetOperationsFilters } from '../../../../../features/fleet-operations/use-fleet-operations-filters';
import { getFleetOperationsDowntimeCost } from '../../../../../lib/api/fleet-operations.api';
import { DOWNTIME_CATEGORY_LABELS } from '../../../../../lib/labels';
import type { FleetAlertSeverity, FleetVehicleDowntimeCostEntity } from '../../../../../types/entities';
import type { DowntimeCategory } from '../../../../../types/entities';
import { formatCurrency, formatNumber } from '../../../../../utils/format';

const ALERT_SEVERITY_TONE: Record<FleetAlertSeverity, 'danger' | 'warning' | 'info'> = {
  CRITICAL: 'danger',
  ATTENTION: 'warning',
  INFO: 'info',
};

const ALERT_SEVERITY_LABEL: Record<FleetAlertSeverity, string> = {
  CRITICAL: 'Crítico',
  ATTENTION: 'Atenção',
  INFO: 'Informativo',
};

const DOWNTIME_CATEGORY_ORDER: DowntimeCategory[] = ['MAINTENANCE', 'BREAKDOWN', 'FUEL', 'OTHER'];

function nullableCurrency(entry: { value: number | null; available: boolean }): string {
  return entry.available && entry.value !== null ? formatCurrency(entry.value) : 'Indisponível';
}

function categoryMinutes(row: FleetVehicleDowntimeCostEntity, category: DowntimeCategory): number {
  return row.byCategory.find((c) => c.category === category)?.durationMinutes ?? 0;
}

export default function FleetDowntimeCostPage(): JSX.Element {
  const { startDate, setStartDate, endDate, setEndDate, vehicleId, setVehicleId, fleetId, setFleetId, filters, hasActiveFilters, clear } =
    useFleetOperationsFilters();

  const query = useQuery({
    queryKey: ['fleet-operations', 'downtime-cost', filters],
    queryFn: ({ signal }) => getFleetOperationsDowntimeCost(filters, signal),
  });

  const vehicleColumns = useMemo<ColumnDef<FleetVehicleDowntimeCostEntity, unknown>[]>(
    () => [
      { header: 'Placa', accessorFn: (row) => row.plate },
      { header: 'Tempo parado', accessorFn: (row) => `${formatNumber(row.totalDowntimeMinutes)} min` },
      { header: 'Manutenção', accessorFn: (row) => `${formatNumber(categoryMinutes(row, 'MAINTENANCE'))} min` },
      { header: 'Quebra', accessorFn: (row) => `${formatNumber(categoryMinutes(row, 'BREAKDOWN'))} min` },
      { header: 'Abastecimento', accessorFn: (row) => `${formatNumber(categoryMinutes(row, 'FUEL'))} min` },
      { header: 'Outras', accessorFn: (row) => `${formatNumber(categoryMinutes(row, 'OTHER'))} min` },
      {
        header: 'Taxa R$/h',
        accessorFn: (row) => (row.revenuePerHour.available && row.revenuePerHour.value !== null ? formatCurrency(row.revenuePerHour.value) : 'Indisponível'),
      },
      { header: 'Receita perdida estimada', cell: ({ row }) => nullableCurrency(row.original.estimatedLostRevenue) },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Tempo parado e receita perdida"
        description="Tempo parado por veículo (manutenção/quebra/abastecimento/outras) e uma estimativa de receita não gerada por causa dessas paradas."
      />

      <FleetFilters
        idPrefix="fdowntime"
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
            <strong className="text-ink">Como a receita perdida é calculada:</strong> tempo parado (horas) × taxa de
            receita/hora do <strong>próprio veículo</strong>, calculada a partir do histórico completo de viagens
            concluídas dele (receita das viagens ÷ horas de operação reais). Sem quilometragem real registrada em
            nenhuma viagem, essa é a única base honesta — nunca R$/km. Veículos com menos de 2 viagens concluídas
            aparecem como <strong>Indisponível</strong>, nunca com um valor inventado.
          </p>
        </div>
      </Card>

      {query.isLoading && <SkeletonCards count={4} />}
      {query.isError && <ErrorState onRetry={() => query.refetch()} />}

      {query.data && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total de paradas" value={formatNumber(query.data.totalStops)} icon={Timer} />
            <StatCard label="Tempo total parado" value={`${formatNumber(query.data.totalDowntimeMinutes)} min`} />
            <StatCard
              label="Receita perdida estimada"
              value={nullableCurrency(query.data.totalEstimatedLostRevenue)}
              icon={Wallet}
              variant="gradient"
            />
            {DOWNTIME_CATEGORY_ORDER.map((category) => {
              const row = query.data.byCategory.find((c) => c.category === category);
              return (
                <StatCard
                  key={category}
                  label={DOWNTIME_CATEGORY_LABELS[category]}
                  value={`${formatNumber(row?.durationMinutes ?? 0)} min`}
                />
              );
            })}
          </div>

          <BarRankingChart
            title="Tempo parado por categoria"
            data={query.data.byCategory.map((c) => ({ label: DOWNTIME_CATEGORY_LABELS[c.category], value: c.durationMinutes }))}
            valueFormatter={(v) => `${formatNumber(v)} min`}
            emptyMessage="Nenhuma parada no período/filtro selecionado."
          />

          <Card>
            <CardHeader
              title="Por veículo"
              description="Tempo parado por categoria, taxa de receita/hora e receita perdida estimada de cada veículo."
            />
            <DataTable columns={vehicleColumns} data={query.data.vehicles} emptyTitle="Nenhuma parada no período/filtro selecionado." />
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RankingCard
              title="Maior receita perdida estimada"
              icon={Wallet}
              entries={query.data.topVehiclesByLostRevenue}
              formatValue={(v) => formatCurrency(v)}
              getHref={(entry) => `/vehicles/${entry.vehicleId}`}
              emptyMessage="Nenhum veículo com taxa de receita/hora disponível."
            />
            <RankingCard
              title="Maior tempo parado"
              icon={Timer}
              entries={query.data.topVehiclesByDowntimeMinutes}
              formatValue={(v) => `${formatNumber(v)} min`}
              getHref={(entry) => `/vehicles/${entry.vehicleId}`}
              emptyMessage="Nenhuma parada no período/filtro selecionado."
            />
          </div>

          <MonthlyChartCard
            title="Evolução mensal do tempo parado"
            data={query.data.monthlyTrendDowntimeMinutes}
            color="#dc2626"
            valueFormatter={(v) => `${formatNumber(v)} min`}
          />

          <Card>
            <CardHeader
              title="Alertas"
              description="Veículos com receita perdida estimada muito acima da média da frota."
              action={
                query.data.downtimeCostAlerts.length > 0 ? (
                  <Badge tone="danger">{query.data.downtimeCostAlerts.length} alerta(s)</Badge>
                ) : undefined
              }
            />
            {query.data.downtimeCostAlerts.length === 0 ? (
              <div className="flex items-center gap-2 p-5 text-sm text-ink-muted">
                <AlertTriangle size={16} />
                Nenhum alerta no período/filtro selecionado.
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {query.data.downtimeCostAlerts.map((alert, index) => (
                  <li key={`${alert.type}-${alert.vehicleId}-${index}`} className="flex items-center justify-between gap-3 p-4">
                    <div className="flex items-center gap-3">
                      <ShieldAlert size={16} className="shrink-0 text-ink-subtle" />
                      <div>
                        <p className="text-sm font-medium text-ink">{alert.plate}</p>
                        <p className="text-xs text-ink-muted">{alert.message}</p>
                      </div>
                    </div>
                    <Badge tone={ALERT_SEVERITY_TONE[alert.severity]}>{ALERT_SEVERITY_LABEL[alert.severity]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
