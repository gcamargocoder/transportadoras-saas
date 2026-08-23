'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Card, CardHeader } from '../../../../../components/ui/card';
import { DatePicker } from '../../../../../components/ui/date-picker';
import { ErrorState } from '../../../../../components/ui/error-state';
import { FilterBar } from '../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../components/ui/form-field';
import { PageHeader } from '../../../../../components/ui/page-header';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { BarRankingChart } from '../../../../../features/fleet-operations/bar-ranking-chart';
import { MonthlyChartCard } from '../../../../../features/dashboard/monthly-chart-card';
import { getCashFlow } from '../../../../../lib/api/finance.api';
import { getFinanceReconciliation } from '../../../../../lib/api/finance-reconciliation.api';
import { EXPENSE_CATEGORY_LABELS } from '../../../../../lib/labels';
import { formatCurrency } from '../../../../../utils/format';

export default function CashFlowPage(): JSX.Element {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const hasActiveFilters = Boolean(from || to);

  const query = useQuery({
    queryKey: ['finance', 'cash-flow', { from, to }],
    queryFn: () => getCashFlow({ from: from || undefined, to: to || undefined }),
  });

  // Fase 75 -- indicador resumido (somente a contagem de criticas, sem
  // trazer a lista) linkando para a pagina de conciliacao completa.
  const reconciliationQuery = useQuery({
    queryKey: ['finance', 'reconciliation', 'summary-badge'],
    queryFn: () => getFinanceReconciliation({ severity: 'CRITICAL', pageSize: 1 }),
  });
  const criticalCount = reconciliationQuery.data?.summary.criticalCount ?? 0;

  return (
    <div>
      <PageHeader
        title="Fluxo de caixa"
        description="Projeção de liquidez sobre os títulos de contas a receber e a pagar já existentes — nunca um saldo bancário real (sem integração ou conciliação bancária)."
        actions={
          reconciliationQuery.data && (
            <a href="/operations/finance/reconciliation">
              <Badge tone={criticalCount > 0 ? 'danger' : 'success'}>
                {criticalCount > 0 ? `${criticalCount} inconsistência(s) crítica(s)` : 'Ledgers consistentes'}
              </Badge>
            </a>
          )
        }
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setFrom('');
          setTo('');
        }}
      >
        <FormField label="De" htmlFor="cashflow-from" className="w-full sm:w-40">
          <DatePicker id="cashflow-from" value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <FormField label="Até" htmlFor="cashflow-to" className="w-full sm:w-40">
          <DatePicker id="cashflow-to" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
      </FilterBar>

      {query.isLoading && <SkeletonCards count={4} />}
      {query.isError && <ErrorState onRetry={() => query.refetch()} />}

      {query.data && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Recebido" value={formatCurrency(query.data.summary.totalReceived)} icon={ArrowUpCircle} tone="success" />
            <StatCard label="Pago" value={formatCurrency(query.data.summary.totalPaid)} icon={ArrowDownCircle} tone="danger" />
            <StatCard
              label="Saldo líquido projetado"
              value={formatCurrency(query.data.summary.projectedNetBalance)}
              icon={query.data.summary.projectedNetBalance >= 0 ? TrendingUp : TrendingDown}
              tone={query.data.summary.projectedNetBalance >= 0 ? 'success' : 'danger'}
            />
            <StatCard label="A receber em aberto" value={formatCurrency(query.data.summary.totalReceivableOpen)} icon={Scale} tone="info" />
            <StatCard label="A pagar em aberto" value={formatCurrency(query.data.summary.totalPayableOpen)} tone="warning" />
            <StatCard label="Vencido a receber" value={formatCurrency(query.data.summary.totalReceivableOverdue)} tone="danger" />
            <StatCard label="Vencido a pagar" value={formatCurrency(query.data.summary.totalPayableOverdue)} tone="danger" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <MonthlyChartCard
              title="Entradas mensais"
              description="Soma de ReceivablePayment por mês do pagamento."
              data={query.data.monthly.map((p) => ({ month: p.period, value: p.received }))}
              color="#16a34a"
            />
            <MonthlyChartCard
              title="Saídas mensais"
              description="Soma de PayablePayment por mês do pagamento."
              data={query.data.monthly.map((p) => ({ month: p.period, value: p.paid }))}
              color="#dc2626"
            />
            <MonthlyChartCard
              title="Saldo líquido mensal"
              description="Entradas - saídas do mês."
              data={query.data.monthly.map((p) => ({ month: p.period, value: p.net }))}
              color="#4f46e5"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarRankingChart
              title="Clientes com maior saldo em aberto"
              description="Top 10 por valor ainda a receber."
              data={query.data.topReceivableCustomers.map((c) => ({ label: c.customerName, value: c.balance }))}
              color="#16a34a"
              emptyMessage="Nenhum cliente com saldo em aberto."
            />
            <BarRankingChart
              title="Categorias com maior saldo em aberto"
              description="Top 10 por valor ainda a pagar."
              data={query.data.topPayableCategories.map((c) => ({ label: EXPENSE_CATEGORY_LABELS[c.category], value: c.balance }))}
              color="#dc2626"
              emptyMessage="Nenhuma categoria com saldo em aberto."
            />
          </div>

          <Card>
            <CardHeader
              title="Vencimentos por mês"
              description="Saldo em aberto de contas a receber/pagar por mês de vencimento -- parte vencida (dueDate no passado) destacada à parte."
            />
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-ink-muted">
                    <th className="px-4 py-2.5">Mês</th>
                    <th className="px-4 py-2.5">A receber (mês)</th>
                    <th className="px-4 py-2.5">Vencido a receber</th>
                    <th className="px-4 py-2.5">A pagar (mês)</th>
                    <th className="px-4 py-2.5">Vencido a pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.monthly.map((p) => (
                    <tr key={p.period} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5 text-ink">{p.period}</td>
                      <td className="px-4 py-2.5 text-ink">{formatCurrency(p.receivableDue)}</td>
                      <td className="px-4 py-2.5 text-danger-600">{formatCurrency(p.receivableOverdue)}</td>
                      <td className="px-4 py-2.5 text-ink">{formatCurrency(p.payableDue)}</td>
                      <td className="px-4 py-2.5 text-danger-600">{formatCurrency(p.payableOverdue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
