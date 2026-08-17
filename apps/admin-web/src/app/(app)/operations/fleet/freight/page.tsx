'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Banknote, Package, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Card, CardHeader } from '../../../../../components/ui/card';
import { DatePicker } from '../../../../../components/ui/date-picker';
import { EntitySelect } from '../../../../../components/ui/entity-select';
import { ErrorState } from '../../../../../components/ui/error-state';
import { FilterBar } from '../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../components/ui/form-field';
import { PageHeader } from '../../../../../components/ui/page-header';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { Tabs } from '../../../../../components/ui/tabs';
import { ContractsPanel } from '../../../../../features/freight/contracts-panel';
import { FreightRulesPanel } from '../../../../../features/freight/freight-rules-panel';
import { FreightSimulatorPanel } from '../../../../../features/freight/freight-simulator-panel';
import { FreightTablesPanel } from '../../../../../features/freight/freight-tables-panel';
import { getFreightDashboard } from '../../../../../lib/api/freight.api';
import { listCustomers } from '../../../../../lib/api/trips.api';
import type { FreightTableEntity } from '../../../../../types/entities';
import { formatCurrency, formatDate } from '../../../../../utils/format';

type TabValue = 'dashboard' | 'contracts' | 'tables' | 'rules' | 'simulator';

export default function FreightPage(): JSX.Element {
  const [tab, setTab] = useState<TabValue>('dashboard');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [rulesTableId, setRulesTableId] = useState<string | undefined>(undefined);

  const filters = {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    customerId: customerId || undefined,
  };
  const hasActiveFilters = Boolean(startDate || endDate || customerId);

  const dashboardQuery = useQuery({
    queryKey: ['freight', 'dashboard', filters],
    queryFn: ({ signal }) => getFreightDashboard(filters, signal),
    enabled: tab === 'dashboard',
  });

  const tabs = useMemo(
    () => [
      { value: 'dashboard', label: 'Dashboard' },
      { value: 'contracts', label: 'Contratos' },
      { value: 'tables', label: 'Tabelas de frete' },
      { value: 'rules', label: 'Regras' },
      { value: 'simulator', label: 'Simulador' },
    ],
    [],
  );

  function handleManageRules(table: FreightTableEntity): void {
    setRulesTableId(table.id);
    setTab('rules');
  }

  return (
    <div>
      <PageHeader
        title="Fretes"
        description="Formação de preço e contratação de fretes — contratos, tabelas, regras versionadas, simulação e integração com viagem/financeiro."
      />

      <div className="mb-4">
        <Tabs tabs={tabs} active={tab} onChange={(v) => setTab(v as TabValue)} />
      </div>

      {tab === 'dashboard' && (
        <div className="flex flex-col gap-6">
          <FilterBar
            hasActiveFilters={hasActiveFilters}
            onClear={() => {
              setStartDate('');
              setEndDate('');
              setCustomerId('');
            }}
          >
            <FormField label="De" htmlFor="freight-filter-from" className="w-full sm:w-40">
              <DatePicker id="freight-filter-from" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </FormField>
            <FormField label="Até" htmlFor="freight-filter-to" className="w-full sm:w-40">
              <DatePicker id="freight-filter-to" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </FormField>
            <FormField label="Cliente" htmlFor="freight-filter-customer" className="w-full sm:w-56">
              <EntitySelect
                id="freight-filter-customer"
                queryKey={['customers', 'select']}
                queryFn={() => listCustomers({ pageSize: 100 })}
                getOptionValue={(c) => c.id}
                getOptionLabel={(c) => c.name}
                value={customerId}
                onChange={setCustomerId}
                placeholder="Todos"
              />
            </FormField>
          </FilterBar>

          {dashboardQuery.isLoading && <SkeletonCards />}
          {dashboardQuery.isError && <ErrorState onRetry={() => dashboardQuery.refetch()} />}

          {dashboardQuery.data && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Valor contratado no período"
                  value={formatCurrency(dashboardQuery.data.contractedAmountTotal)}
                  icon={Banknote}
                  tone="brand"
                />
                <StatCard label="Fretes realizados" value={String(dashboardQuery.data.freightsCount)} icon={Package} />
                <StatCard
                  label="Ticket médio"
                  value={dashboardQuery.data.averageTicket !== null ? formatCurrency(dashboardQuery.data.averageTicket) : '—'}
                />
                <StatCard
                  label="Viagens sem tabela/regra aplicável"
                  value={String(dashboardQuery.data.tripsWithoutApplicableRuleCount)}
                  icon={AlertTriangle}
                  tone={dashboardQuery.data.tripsWithoutApplicableRuleCount > 0 ? 'warning' : 'success'}
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                  Resultado — contratado × realizado (reaproveita o financeiro da viagem)
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard label="Margem prevista" value={formatCurrency(dashboardQuery.data.projectedMarginTotal)} icon={TrendingUp} tone="info" />
                  <StatCard label="Resultado real" value={formatCurrency(dashboardQuery.data.realResultTotal)} icon={TrendingDown} tone="info" />
                  <StatCard label="Receita realizada" value={formatCurrency(dashboardQuery.data.realizedRevenueTotal)} />
                  <StatCard label="Custo realizado" value={formatCurrency(dashboardQuery.data.realizedCostTotal)} />
                </div>
                <p className="mt-2 text-xs text-ink-subtle">
                  Diferença previsto × realizado: {formatCurrency(dashboardQuery.data.resultDifferenceTotal)}. &quot;Custo
                  previsto&quot; não existe como conceito no projeto — a margem prevista compara o valor contratado
                  contra o custo já realizado até o momento.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader title="Principais clientes" description="Por valor contratado no período." />
                  <ul className="divide-y divide-border">
                    {dashboardQuery.data.topCustomers.length === 0 && (
                      <li className="px-5 py-4 text-sm text-ink-subtle">Nenhum frete no período.</li>
                    )}
                    {dashboardQuery.data.topCustomers.map((c) => (
                      <li key={c.customerId} className="flex items-center justify-between px-5 py-2.5 text-sm">
                        <span className="truncate">{c.customerName}</span>
                        <span className="shrink-0 font-medium">{formatCurrency(c.totalAmount)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card>
                  <CardHeader title="Principais rotas" description="Por valor contratado no período." />
                  <ul className="divide-y divide-border">
                    {dashboardQuery.data.topRoutes.length === 0 && (
                      <li className="px-5 py-4 text-sm text-ink-subtle">Nenhum frete no período.</li>
                    )}
                    {dashboardQuery.data.topRoutes.map((r, i) => (
                      <li key={i} className="flex items-center justify-between px-5 py-2.5 text-sm">
                        <span className="truncate">{r.originName ?? '—'} → {r.destinationName ?? '—'}</span>
                        <span className="shrink-0 font-medium">{formatCurrency(r.totalAmount)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card>
                  <CardHeader title="Tabelas mais utilizadas" />
                  <ul className="divide-y divide-border">
                    {dashboardQuery.data.topFreightTables.length === 0 && (
                      <li className="px-5 py-4 text-sm text-ink-subtle">Nenhum frete no período.</li>
                    )}
                    {dashboardQuery.data.topFreightTables.map((t) => (
                      <li key={t.freightTableId} className="flex items-center justify-between px-5 py-2.5 text-sm">
                        <span className="truncate">{t.freightTableName}</span>
                        <span className="shrink-0 font-medium">{t.freightsCount}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>

              {dashboardQuery.data.contractsExpiringSoon.length > 0 && (
                <Card>
                  <CardHeader
                    title="Contratos próximos do vencimento"
                    description="Status ACTIVE com vencimento nos próximos 30 dias."
                  />
                  <ul className="divide-y divide-border">
                    {dashboardQuery.data.contractsExpiringSoon.map((c) => (
                      <li key={c.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                        <span className="truncate">{c.code} · {c.customerName}</span>
                        <Badge tone="warning">{formatDate(c.endDate)}</Badge>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'contracts' && <ContractsPanel />}
      {tab === 'tables' && <FreightTablesPanel onManageRules={handleManageRules} />}
      {tab === 'rules' && <FreightRulesPanel initialTableId={rulesTableId} />}
      {tab === 'simulator' && <FreightSimulatorPanel />}
    </div>
  );
}
