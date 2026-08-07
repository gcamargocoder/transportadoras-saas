'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Banknote,
  Fuel,
  Gauge,
  MapPin,
  PiggyBank,
  Route as RouteIcon,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';
import { DatePicker } from '../../../components/ui/date-picker';
import { ErrorState } from '../../../components/ui/error-state';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { PageHeader } from '../../../components/ui/page-header';
import { SkeletonCards } from '../../../components/ui/skeleton';
import { StatCard } from '../../../components/ui/stat-card';
import { MonthlyChartCard } from '../../../features/dashboard/monthly-chart-card';
import { getDashboard } from '../../../lib/api/dashboard.api';
import { formatCurrency, formatNumber, formatPercent } from '../../../utils/format';

export default function DashboardPage(): JSX.Element {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const query = useQuery({
    queryKey: ['dashboard', { startDate, endDate }],
    queryFn: ({ signal }) =>
      getDashboard({ startDate: startDate || undefined, endDate: endDate || undefined }, signal),
  });

  const hasActiveFilters = Boolean(startDate || endDate);

  return (
    <div>
      <PageHeader
        title="Dashboard executivo"
        description="Indicadores estratégicos de operação, frota e financeiro."
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setStartDate('');
          setEndDate('');
        }}
      >
        <FormField label="De" htmlFor="dash-start">
          <DatePicker
            id="dash-start"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </FormField>
        <FormField label="Até" htmlFor="dash-end">
          <DatePicker id="dash-end" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </FormField>
      </FilterBar>

      {query.isLoading && <SkeletonCards count={4} />}

      {query.isError && <ErrorState onRetry={() => query.refetch()} />}

      {query.data && (
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Visão geral
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Viagens totais"
                value={formatNumber(query.data.overview.totalTrips)}
                icon={RouteIcon}
              />
              <StatCard
                label="Viagens ativas"
                value={formatNumber(query.data.overview.activeTrips)}
                icon={Gauge}
                tone="info"
              />
              <StatCard
                label="Viagens concluídas"
                value={formatNumber(query.data.overview.finishedTrips)}
                icon={TrendingUp}
                tone="success"
              />
              <StatCard
                label="Viagens canceladas"
                value={formatNumber(query.data.overview.cancelledTrips)}
                icon={TrendingDown}
                tone="danger"
              />
              <StatCard
                label="Motoristas ativos"
                value={`${formatNumber(query.data.overview.activeDrivers)} / ${formatNumber(query.data.overview.totalDrivers)}`}
                icon={Users}
              />
              <StatCard
                label="Veículos disponíveis"
                value={`${formatNumber(query.data.overview.availableVehicles)} / ${formatNumber(query.data.overview.totalVehicles)}`}
                icon={Truck}
              />
              <StatCard
                label="Veículos em manutenção"
                value={formatNumber(query.data.overview.maintenanceVehicles)}
                icon={Wrench}
                tone="warning"
              />
              <StatCard
                label="Clientes"
                value={formatNumber(query.data.overview.customers)}
                icon={MapPin}
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Financeiro
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Receita total"
                value={formatCurrency(query.data.financial.totalRevenue)}
                icon={TrendingUp}
                tone="success"
              />
              <StatCard
                label="Despesas aprovadas"
                value={formatCurrency(query.data.financial.approvedExpenses)}
                icon={Wallet}
                tone="danger"
              />
              <StatCard
                label="Adiantamentos"
                value={formatCurrency(query.data.financial.advances)}
                icon={Banknote}
              />
              <StatCard
                label="Resultado líquido"
                value={formatCurrency(query.data.financial.netResult)}
                icon={PiggyBank}
                tone={query.data.financial.netResult >= 0 ? 'success' : 'danger'}
              />
              <StatCard label="Lucro" value={formatCurrency(query.data.financial.profit)} />
              <StatCard label="Margem" value={formatPercent(query.data.financial.margin)} />
              <StatCard
                label="Ticket médio (receita)"
                value={formatCurrency(query.data.financial.averageTripRevenue)}
              />
              <StatCard
                label="Ticket médio (despesa)"
                value={formatCurrency(query.data.financial.averageTripExpense)}
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Operacional
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Viagens hoje"
                value={formatNumber(query.data.operational.todayTrips)}
              />
              <StatCard
                label="Viagens atrasadas"
                value={formatNumber(query.data.operational.lateTrips)}
                icon={AlertTriangle}
                tone="warning"
              />
              <StatCard
                label="Em andamento"
                value={formatNumber(query.data.operational.tripsInProgress)}
              />
              <StatCard
                label="Concluídas hoje"
                value={formatNumber(query.data.operational.completedToday)}
              />
              <StatCard
                label="Km rodados"
                value={`${formatNumber(query.data.operational.kmDriven)} km`}
              />
              <StatCard
                label="Distância média/viagem"
                value={`${formatNumber(query.data.operational.averageTripDistance)} km`}
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Frota
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Combustível consumido"
                value={`${formatNumber(query.data.fleet.fuelConsumed, 1)} L`}
                icon={Fuel}
              />
              <StatCard
                label="Custo com combustível"
                value={formatCurrency(query.data.fleet.fuelCost)}
              />
              <StatCard
                label="Consumo médio"
                value={`${formatNumber(query.data.fleet.averageConsumptionKmL, 1)} km/L`}
              />
              <StatCard label="Custo por km" value={formatCurrency(query.data.fleet.costPerKm)} />
              <StatCard
                label="Custo com manutenção"
                value={formatCurrency(query.data.fleet.maintenanceCost)}
                icon={Wrench}
              />
              <StatCard
                label="Manutenções em aberto"
                value={formatNumber(query.data.fleet.maintenanceOpen)}
                tone="warning"
              />
              <StatCard
                label="Manutenções encerradas"
                value={formatNumber(query.data.fleet.maintenanceClosed)}
                tone="success"
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Evolução (últimos 12 meses)
            </h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <MonthlyChartCard
                title="Receita mensal"
                data={query.data.charts.monthlyRevenue}
                color="#16a34a"
              />
              <MonthlyChartCard
                title="Despesas mensais"
                data={query.data.charts.monthlyExpenses}
                color="#dc2626"
              />
              <MonthlyChartCard
                title="Custo de combustível mensal"
                data={query.data.charts.monthlyFuelCost}
                color="#d97706"
              />
              <MonthlyChartCard
                title="Viagens por mês"
                data={query.data.charts.monthlyTrips}
                color="#4f46e5"
                valueFormatter={(v) => formatNumber(v)}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
