'use client';

import { useQuery } from '@tanstack/react-query';
import { Fuel, Ticket, Wallet, Wrench } from 'lucide-react';
import { Card, CardHeader } from '../../../../../components/ui/card';
import { ErrorState } from '../../../../../components/ui/error-state';
import { PageHeader } from '../../../../../components/ui/page-header';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { BarRankingChart } from '../../../../../features/fleet-operations/bar-ranking-chart';
import { FleetFilters } from '../../../../../features/fleet-operations/fleet-filters';
import { useFleetOperationsFilters } from '../../../../../features/fleet-operations/use-fleet-operations-filters';
import { MonthlyChartCard } from '../../../../../features/dashboard/monthly-chart-card';
import { getFleetOperationsCosts } from '../../../../../lib/api/fleet-operations.api';
import { EXPENSE_CATEGORY_LABELS, labelOrValue } from '../../../../../lib/labels';
import { formatCurrency, formatNumber } from '../../../../../utils/format';

// 'TOLL' nao e um ExpenseCategory real (pedagio vem de TollTransaction, nao
// de TripExpense) -- rotulo adicional so para exibicao deste breakdown.
const COST_CATEGORY_LABELS: Record<string, string> = { ...EXPENSE_CATEGORY_LABELS, TOLL: 'Pedágio' };

export default function FleetCostsPage(): JSX.Element {
  const { startDate, setStartDate, endDate, setEndDate, vehicleId, setVehicleId, fleetId, setFleetId, filters, hasActiveFilters, clear } =
    useFleetOperationsFilters();

  const query = useQuery({
    queryKey: ['fleet-operations', 'costs', filters],
    queryFn: ({ signal }) => getFleetOperationsCosts(filters, signal),
  });

  return (
    <div>
      <PageHeader
        title="Custos da frota"
        description="Custos REALIZADOS: combustível, manutenção, pneus, pedágio e outras despesas aprovadas. Nunca inclui valores previstos/estimados."
      />

      <FleetFilters
        idPrefix="fcost"
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
            <StatCard label="Custo total" value={formatCurrency(query.data.totalCost)} icon={Wallet} />
            <StatCard label="Combustível" value={formatCurrency(query.data.fuelCost)} icon={Fuel} />
            <StatCard label="Manutenção" value={formatCurrency(query.data.maintenanceCost)} icon={Wrench} />
            <StatCard label="Pedágio" value={formatCurrency(query.data.tollCost)} icon={Ticket} />
            <StatCard label="Pneus" value={formatCurrency(query.data.tireCost)} />
            <StatCard label="Outras despesas" value={formatCurrency(query.data.otherCost)} />
            <StatCard
              label="Custo médio/veículo"
              value={query.data.averageCostPerVehicle === null ? '—' : formatCurrency(query.data.averageCostPerVehicle)}
            />
            {query.data.previousPeriod && (
              <StatCard
                label="Vs período anterior"
                value={
                  query.data.previousPeriod.deltaPercent === null
                    ? '—'
                    : `${query.data.previousPeriod.deltaPercent >= 0 ? '+' : ''}${formatNumber(query.data.previousPeriod.deltaPercent, 1)}%`
                }
                tone={
                  query.data.previousPeriod.deltaPercent === null
                    ? 'brand'
                    : query.data.previousPeriod.deltaPercent > 0
                      ? 'danger'
                      : 'success'
                }
              />
            )}
          </div>

          <MonthlyChartCard title="Evolução mensal do custo total" data={query.data.monthlyTrend} color="#4f46e5" />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarRankingChart
              title="Custo por categoria"
              data={query.data.costByCategory
                .filter((c) => c.amount > 0)
                .map((c) => ({ label: labelOrValue(COST_CATEGORY_LABELS, c.category), value: c.amount }))}
              color="#4f46e5"
              emptyMessage="Nenhum custo registrado no período/filtro selecionado."
            />
            <BarRankingChart
              title="Top 5 veículos por custo"
              data={query.data.topVehiclesByCost.map((v) => ({ label: v.plate, value: v.value }))}
              color="#dc2626"
              emptyMessage="Nenhum veículo com custo no período/filtro selecionado."
            />
          </div>

          <Card>
            <CardHeader title="Custo por frota" description='fleetId nulo aparece como "Sem frota".' />
            {query.data.costByFleet.length === 0 ? (
              <p className="p-5 text-sm text-ink-muted">Nenhuma frota com custo no período/filtro selecionado.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {query.data.costByFleet.map((entry) => (
                  <li key={entry.fleetId ?? 'sem-frota'} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="text-sm text-ink">{entry.fleetName}</span>
                    <span className="text-sm font-medium text-ink">{formatCurrency(entry.amount)}</span>
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
