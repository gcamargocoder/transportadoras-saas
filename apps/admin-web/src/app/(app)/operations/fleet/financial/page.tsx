'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Banknote, HandCoins, Percent, Receipt, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Card, CardHeader } from '../../../../../components/ui/card';
import { DatePicker } from '../../../../../components/ui/date-picker';
import { EntitySelect } from '../../../../../components/ui/entity-select';
import { ErrorState } from '../../../../../components/ui/error-state';
import { FilterBar } from '../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../components/ui/form-field';
import { PageHeader } from '../../../../../components/ui/page-header';
import { Select } from '../../../../../components/ui/select';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { BarRankingChart } from '../../../../../features/fleet-operations/bar-ranking-chart';
import { MonthlyChartCard } from '../../../../../features/dashboard/monthly-chart-card';
import { useFleetOperationsFilters } from '../../../../../features/fleet-operations/use-fleet-operations-filters';
import { listCustomers } from '../../../../../lib/api/trips.api';
import { listDrivers } from '../../../../../lib/api/drivers.api';
import { listFleets, listVehicles } from '../../../../../lib/api/fleet.api';
import { getFleetOperationsFinancial } from '../../../../../lib/api/fleet-operations.api';
import { EXPENSE_CATEGORY_LABELS, EXPENSE_STATUS_LABELS, REVENUE_CATEGORY_LABELS, labelOrValue } from '../../../../../lib/labels';
import type { ExpenseCategory, ExpenseStatus, RevenueCategory } from '../../../../../types/enums';
import { formatCurrency, formatPercent } from '../../../../../utils/format';

// 'TOLL' nao e um ExpenseCategory real (pedagio vem de TollTransaction, nao
// de TripExpense) -- mesmo padrao de /operations/fleet/costs.
const COST_CATEGORY_LABELS: Record<string, string> = { ...EXPENSE_CATEGORY_LABELS, TOLL: 'Pedágio' };

export default function FleetFinancialPage(): JSX.Element {
  const { startDate, setStartDate, endDate, setEndDate, vehicleId, setVehicleId, fleetId, setFleetId, hasActiveFilters: hasSharedFilters, clear: clearShared } =
    useFleetOperationsFilters();

  const [customerId, setCustomerId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [revenueCategory, setRevenueCategory] = useState<RevenueCategory | ''>('');
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory | ''>('');
  const [expenseStatus, setExpenseStatus] = useState<ExpenseStatus | ''>('');

  const filters = {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    vehicleId: vehicleId || undefined,
    fleetId: fleetId || undefined,
    customerId: customerId || undefined,
    driverId: driverId || undefined,
    revenueCategory: revenueCategory || undefined,
    expenseCategory: expenseCategory || undefined,
    expenseStatus: expenseStatus || undefined,
  };
  const hasActiveFilters = hasSharedFilters || Boolean(customerId || driverId || revenueCategory || expenseCategory || expenseStatus);

  function clearAll(): void {
    clearShared();
    setCustomerId('');
    setDriverId('');
    setRevenueCategory('');
    setExpenseCategory('');
    setExpenseStatus('');
  }

  const query = useQuery({
    queryKey: ['fleet-operations', 'financial', filters],
    queryFn: ({ signal }) => getFleetOperationsFinancial(filters, signal),
  });

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description="Receitas, despesas, adiantamentos e resultado consolidado da frota. Custo total reutiliza a mesma apuração de /operations/fleet/costs."
      />

      <FilterBar hasActiveFilters={hasActiveFilters} onClear={clearAll}>
        <FormField label="De" htmlFor="ffin-start">
          <DatePicker id="ffin-start" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </FormField>
        <FormField label="Até" htmlFor="ffin-end">
          <DatePicker id="ffin-end" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </FormField>
        <FormField label="Veículo" htmlFor="ffin-vehicle" className="w-full sm:w-44">
          <EntitySelect
            id="ffin-vehicle"
            queryKey={['vehicles', 'select']}
            queryFn={() => listVehicles({ pageSize: 100 })}
            getOptionValue={(v) => v.id}
            getOptionLabel={(v) => v.plate}
            value={vehicleId}
            onChange={setVehicleId}
            placeholder="Todos"
          />
        </FormField>
        <FormField label="Frota" htmlFor="ffin-fleet" className="w-full sm:w-40">
          <EntitySelect
            id="ffin-fleet"
            queryKey={['fleets', 'select']}
            queryFn={() => listFleets({ pageSize: 100 })}
            getOptionValue={(f) => f.id}
            getOptionLabel={(f) => f.name}
            value={fleetId}
            onChange={setFleetId}
            placeholder="Todas"
          />
        </FormField>
        <FormField label="Motorista" htmlFor="ffin-driver" className="w-full sm:w-44">
          <EntitySelect
            id="ffin-driver"
            queryKey={['drivers', 'select']}
            queryFn={() => listDrivers({ pageSize: 100 })}
            getOptionValue={(d) => d.id}
            getOptionLabel={(d) => d.name}
            value={driverId}
            onChange={setDriverId}
            placeholder="Todos"
          />
        </FormField>
        <FormField label="Cliente" htmlFor="ffin-customer" className="w-full sm:w-44">
          <EntitySelect
            id="ffin-customer"
            queryKey={['customers', 'select']}
            queryFn={() => listCustomers({ pageSize: 100 })}
            getOptionValue={(c) => c.id}
            getOptionLabel={(c) => c.name}
            value={customerId}
            onChange={setCustomerId}
            placeholder="Todos"
          />
        </FormField>
        <FormField label="Categoria receita" htmlFor="ffin-rev-cat" className="w-full sm:w-44">
          <Select id="ffin-rev-cat" value={revenueCategory} onChange={(e) => setRevenueCategory(e.target.value as RevenueCategory | '')}>
            <option value="">Todas</option>
            {(Object.keys(REVENUE_CATEGORY_LABELS) as RevenueCategory[]).map((c) => (
              <option key={c} value={c}>
                {REVENUE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Categoria despesa" htmlFor="ffin-exp-cat" className="w-full sm:w-44">
          <Select id="ffin-exp-cat" value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value as ExpenseCategory | '')}>
            <option value="">Todas</option>
            {(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Status despesa" htmlFor="ffin-exp-status" className="w-full sm:w-40">
          <Select id="ffin-exp-status" value={expenseStatus} onChange={(e) => setExpenseStatus(e.target.value as ExpenseStatus | '')}>
            <option value="">Todos</option>
            {(Object.keys(EXPENSE_STATUS_LABELS) as ExpenseStatus[]).map((s) => (
              <option key={s} value={s}>
                {EXPENSE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
      </FilterBar>

      {query.isLoading && <SkeletonCards count={4} />}
      {query.isError && <ErrorState onRetry={() => query.refetch()} />}

      {query.data && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Receita total" value={formatCurrency(query.data.summary.totalRevenue)} icon={TrendingUp} tone="success" />
            <StatCard label="Despesas totais" value={formatCurrency(query.data.summary.totalExpenses)} icon={Receipt} />
            <StatCard label="Custo total" value={formatCurrency(query.data.summary.totalCost)} icon={Wallet} />
            <StatCard
              label="Resultado"
              value={formatCurrency(query.data.summary.result)}
              icon={query.data.summary.result >= 0 ? TrendingUp : TrendingDown}
              tone={query.data.summary.result >= 0 ? 'success' : 'danger'}
            />
            <StatCard
              label="Margem"
              value={query.data.summary.marginPercent === null ? '—' : formatPercent(query.data.summary.marginPercent)}
              icon={Percent}
            />
            <StatCard label="Adiantamentos" value={formatCurrency(query.data.summary.totalAdvances)} icon={HandCoins} />
            <StatCard label="Despesas pendentes" value={formatCurrency(query.data.summary.pendingExpenses)} icon={AlertTriangle} tone="warning" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <MonthlyChartCard title="Receita mensal" data={query.data.monthlyRevenue} color="#16a34a" />
            <MonthlyChartCard title="Despesas mensais" data={query.data.monthlyExpenses} color="#dc2626" />
            <MonthlyChartCard title="Resultado mensal" data={query.data.monthlyResult} color="#4f46e5" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarRankingChart
              title="Top 5 veículos por receita"
              data={query.data.topVehiclesByRevenue.map((v) => ({ label: v.plate, value: v.value }))}
              color="#16a34a"
              emptyMessage="Nenhum veículo com receita no período/filtro selecionado."
            />
            <BarRankingChart
              title="Top 5 veículos por despesa"
              data={query.data.topVehiclesByExpense.map((v) => ({ label: v.plate, value: v.value }))}
              color="#dc2626"
              emptyMessage="Nenhum veículo com despesa no período/filtro selecionado."
            />
            <BarRankingChart
              title="Maiores despesas por categoria"
              data={query.data.topExpenseCategories
                .filter((c) => c.amount > 0)
                .map((c) => ({ label: labelOrValue(COST_CATEGORY_LABELS, c.category), value: c.amount }))}
              color="#dc2626"
              emptyMessage="Nenhuma despesa registrada no período/filtro selecionado."
            />
            <BarRankingChart
              title="Maiores custos por viagem"
              data={query.data.topTripsByCost.map((t) => ({ label: t.label, value: t.value }))}
              color="#f59e0b"
              emptyMessage="Nenhuma viagem com custo no período/filtro selecionado."
            />
            <BarRankingChart
              title="Melhores resultados por viagem"
              data={query.data.bestTripsByResult.map((t) => ({ label: t.label, value: t.value }))}
              color="#16a34a"
              emptyMessage="Nenhuma viagem no período/filtro selecionado."
            />
            <BarRankingChart
              title="Piores resultados por viagem"
              data={query.data.worstTripsByResult.map((t) => ({ label: t.label, value: t.value }))}
              color="#dc2626"
              emptyMessage="Nenhuma viagem no período/filtro selecionado."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Receita por frota" description='fleetId nulo aparece como "Sem frota".' />
              {query.data.revenueByFleet.length === 0 ? (
                <p className="p-5 text-sm text-ink-muted">Nenhuma frota com receita no período/filtro selecionado.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {query.data.revenueByFleet.map((entry) => (
                    <li key={entry.fleetId ?? 'sem-frota'} className="flex items-center justify-between gap-3 px-5 py-3">
                      <span className="text-sm text-ink">{entry.fleetName}</span>
                      <span className="text-sm font-medium text-ink">{formatCurrency(entry.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
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
            <Card>
              <CardHeader title="Receita por cliente" description='Sem cliente vinculado aparece como "Sem cliente".' />
              {query.data.revenueByCustomer.length === 0 ? (
                <p className="p-5 text-sm text-ink-muted">Nenhum cliente com receita no período/filtro selecionado.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {query.data.revenueByCustomer.map((entry) => (
                    <li key={entry.customerId ?? 'sem-cliente'} className="flex items-center justify-between gap-3 px-5 py-3">
                      <span className="text-sm text-ink">{entry.customerName}</span>
                      <span className="text-sm font-medium text-ink">{formatCurrency(entry.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Despesas e adiantamentos por motorista" />
              {query.data.byDriver.length === 0 ? (
                <p className="p-5 text-sm text-ink-muted">Nenhum motorista com despesa/adiantamento no período/filtro selecionado.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {query.data.byDriver.map((entry) => (
                    <li key={entry.driverId} className="flex items-center justify-between gap-3 px-5 py-3">
                      <span className="text-sm text-ink">{entry.driverName}</span>
                      <span className="text-sm text-ink-muted">
                        <Banknote size={12} className="mr-1 inline" />
                        {formatCurrency(entry.expenses)} · <HandCoins size={12} className="mr-1 inline" />
                        {formatCurrency(entry.advances)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
