'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Droplets, Fuel, Gauge, Info, ShieldAlert, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Card, CardHeader } from '../../../../../components/ui/card';
import { DataTable } from '../../../../../components/ui/data-table';
import { ErrorState } from '../../../../../components/ui/error-state';
import { PageHeader } from '../../../../../components/ui/page-header';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { MonthlyChartCard } from '../../../../../features/dashboard/monthly-chart-card';
import { FleetFilters } from '../../../../../features/fleet-operations/fleet-filters';
import { useFleetOperationsFilters } from '../../../../../features/fleet-operations/use-fleet-operations-filters';
import { getFleetOperationsFuel } from '../../../../../lib/api/fleet-operations.api';
import type {
  FleetAlertSeverity,
  FleetFuelFleetBreakdownEntity,
  FleetFuelVehicleBreakdownEntity,
  FleetVehicleRankingEntryEntity,
} from '../../../../../types/entities';
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

function nullableCurrency(value: number | null): string {
  return value === null ? '—' : formatCurrency(value);
}

function consumptionLabel(entry: { value: number | null; available: boolean }): string {
  return entry.available && entry.value !== null ? `${formatNumber(entry.value, 1)} km/L` : 'Indisponível';
}

function costPerKmLabel(entry: { value: number | null; available: boolean }): string {
  return entry.available && entry.value !== null ? formatCurrency(entry.value) : 'Indisponível';
}

export default function FleetFuelPage(): JSX.Element {
  const { startDate, setStartDate, endDate, setEndDate, vehicleId, setVehicleId, fleetId, setFleetId, filters, hasActiveFilters, clear } =
    useFleetOperationsFilters();

  const query = useQuery({
    queryKey: ['fleet-operations', 'fuel', filters],
    queryFn: ({ signal }) => getFleetOperationsFuel(filters, signal),
  });

  const vehicleColumns = useMemo<ColumnDef<FleetFuelVehicleBreakdownEntity, unknown>[]>(
    () => [
      { header: '#', accessorFn: (row) => row.rankPosition },
      { header: 'Placa', accessorFn: (row) => row.plate },
      { header: 'Frota', accessorFn: (row) => row.fleetName },
      { header: 'Abastecimentos', accessorFn: (row) => formatNumber(row.supplyCount) },
      { header: 'Litros', accessorFn: (row) => `${formatNumber(row.liters, 1)} L` },
      { header: 'Custo', cell: ({ row }) => formatCurrency(row.original.cost) },
      { header: 'Preço médio/L', accessorFn: (row) => nullableCurrency(row.averagePricePerLiter) },
      { header: 'Consumo', accessorFn: (row) => consumptionLabel(row.consumption) },
      { header: 'Custo/km', accessorFn: (row) => costPerKmLabel(row.costPerKm) },
      {
        header: 'Hodômetro',
        cell: ({ row }) =>
          row.original.hasOdometerAnomaly ? (
            <Badge tone="danger">Regressão detectada</Badge>
          ) : (
            <span className="text-xs text-ink-muted">Consistente</span>
          ),
      },
    ],
    [],
  );

  const fleetColumns = useMemo<ColumnDef<FleetFuelFleetBreakdownEntity, unknown>[]>(
    () => [
      { header: 'Frota', accessorFn: (row) => row.fleetName },
      { header: 'Abastecimentos', accessorFn: (row) => formatNumber(row.supplyCount) },
      { header: 'Litros', accessorFn: (row) => `${formatNumber(row.liters, 1)} L` },
      { header: 'Custo', cell: ({ row }) => formatCurrency(row.original.cost) },
      { header: 'Preço médio/L', accessorFn: (row) => nullableCurrency(row.averagePricePerLiter) },
      { header: 'Consumo', accessorFn: (row) => consumptionLabel(row.consumption) },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Abastecimento — gestão avançada"
        description="Consumo (km/L) e custo por km de combustível são calculados apenas quando há leituras de hodômetro suficientes (≥ 2 abastecimentos) — nunca estimados. Distinto do custo TOTAL da frota por km, ainda indisponível (depende de dados de viagem não coletados)."
      />

      <FleetFilters
        idPrefix="ffuel"
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
            <StatCard label="Custo total" value={formatCurrency(query.data.summary.totalCost)} icon={Wallet} />
            <StatCard label="Litros abastecidos" value={`${formatNumber(query.data.summary.totalLiters, 1)} L`} icon={Droplets} />
            <StatCard label="Abastecimentos" value={formatNumber(query.data.summary.supplyCount)} icon={Fuel} />
            <StatCard label="Preço médio/litro" value={nullableCurrency(query.data.summary.averagePricePerLiter)} />
            <StatCard label="Custo médio/abastecimento" value={nullableCurrency(query.data.summary.averageCostPerSupply)} />
            <StatCard label="Veículos abastecidos" value={formatNumber(query.data.summary.vehiclesSupplied)} />
            <StatCard label="Frotas abastecidas" value={formatNumber(query.data.summary.fleetsSupplied)} />
            <StatCard label="Consumo médio da frota" value={consumptionLabel(query.data.consumption)} icon={Gauge} />
            <StatCard label="Custo de combustível/km" value={costPerKmLabel(query.data.costPerKm)} />
            {query.data.previousPeriod && (
              <StatCard
                label="Custo vs período anterior"
                value={
                  query.data.previousPeriod.costDeltaPercent === null
                    ? '—'
                    : `${query.data.previousPeriod.costDeltaPercent >= 0 ? '+' : ''}${formatNumber(query.data.previousPeriod.costDeltaPercent, 1)}%`
                }
                tone={
                  query.data.previousPeriod.costDeltaPercent === null
                    ? 'brand'
                    : query.data.previousPeriod.costDeltaPercent > 0
                      ? 'danger'
                      : 'success'
                }
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MonthlyChartCard title="Evolução mensal do custo" data={query.data.monthlyTrendCost} color="#4f46e5" />
            <MonthlyChartCard
              title="Evolução mensal dos litros"
              data={query.data.monthlyTrendLiters}
              color="#0891b2"
              valueFormatter={(v) => `${formatNumber(v, 1)} L`}
            />
          </div>

          <Card>
            <CardHeader
              title="Alertas de abastecimento"
              description="Preço/consumo fora do padrão, volume excepcional e hodômetro regressivo — calculados a partir dos dados do período/filtro, nunca persistidos."
            />
            {query.data.alerts.length === 0 ? (
              <div className="flex items-center gap-2 p-5 text-sm text-ink-muted">
                <Info size={16} />
                Nenhum alerta no período/filtro selecionado.
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {query.data.alerts.map((alert, index) => (
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

          <Card>
            <CardHeader title="Por veículo" description="Todos os veículos com abastecimento no período/filtro, ordenados por custo total." />
            <DataTable columns={vehicleColumns} data={query.data.vehicleBreakdown} emptyTitle="Sem abastecimentos no período/filtro." />
          </Card>

          <Card>
            <CardHeader title="Por frota" description='fleetId nulo aparece como "Sem frota".' />
            <DataTable columns={fleetColumns} data={query.data.fleetBreakdown} emptyTitle="Sem abastecimentos no período/filtro." />
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RankingCard title="Maior custo total" icon={Wallet} entries={query.data.rankings.topCost} formatValue={(v) => formatCurrency(v)} />
            <RankingCard title="Menor custo total" icon={Wallet} entries={query.data.rankings.bottomCost} formatValue={(v) => formatCurrency(v)} />
            <RankingCard
              title="Maior volume abastecido"
              icon={Droplets}
              entries={query.data.rankings.topVolume}
              formatValue={(v) => `${formatNumber(v, 1)} L`}
            />
            <RankingCard
              title="Menor volume abastecido"
              icon={Droplets}
              entries={query.data.rankings.bottomVolume}
              formatValue={(v) => `${formatNumber(v, 1)} L`}
            />
            <RankingCard
              title="Melhor consumo (km/L)"
              icon={Gauge}
              entries={query.data.rankings.bestConsumption}
              formatValue={(v) => `${formatNumber(v, 1)} km/L`}
              emptyMessage="Nenhum veículo com consumo disponível (mínimo 2 abastecimentos com hodômetro)."
            />
            <RankingCard
              title="Pior consumo (km/L)"
              icon={Gauge}
              entries={query.data.rankings.worstConsumption}
              formatValue={(v) => `${formatNumber(v, 1)} km/L`}
              emptyMessage="Nenhum veículo com consumo disponível (mínimo 2 abastecimentos com hodômetro)."
            />
            <RankingCard
              title="Maior preço médio/litro"
              icon={Fuel}
              entries={query.data.rankings.topPricePerLiter}
              formatValue={(v) => formatCurrency(v)}
            />
            <RankingCard
              title="Maior nº de abastecimentos"
              icon={Fuel}
              entries={query.data.rankings.topSupplyCount}
              formatValue={(v) => formatNumber(v)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function RankingCard({
  title,
  icon: Icon,
  entries,
  formatValue,
  emptyMessage = 'Sem dados no período/filtro selecionado.',
}: {
  title: string;
  icon: LucideIcon;
  entries: FleetVehicleRankingEntryEntity[];
  formatValue: (value: number) => string;
  emptyMessage?: string;
}): JSX.Element {
  return (
    <Card>
      <CardHeader title={title} />
      {entries.length === 0 ? (
        <p className="p-5 text-sm text-ink-muted">{emptyMessage}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border">
          {entries.map((entry, index) => (
            <li key={entry.vehicleId} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="flex items-center gap-2 text-sm text-ink">
                <Icon size={14} className="text-ink-subtle" />
                <span className="text-xs text-ink-subtle">{index + 1}.</span> {entry.plate}
              </span>
              <span className="text-sm font-medium text-ink">{formatValue(entry.value)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
