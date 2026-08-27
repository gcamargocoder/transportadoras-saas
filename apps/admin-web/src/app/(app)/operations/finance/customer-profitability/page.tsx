'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { DataTable } from '../../../../../components/ui/data-table';
import { DatePicker } from '../../../../../components/ui/date-picker';
import { EntitySelect } from '../../../../../components/ui/entity-select';
import { FilterBar } from '../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../components/ui/form-field';
import { PageHeader } from '../../../../../components/ui/page-header';
import { Pagination } from '../../../../../components/ui/pagination';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { ErrorState } from '../../../../../components/ui/error-state';
import { BarRankingChart } from '../../../../../features/fleet-operations/bar-ranking-chart';
import {
  getCustomerProfitabilityDashboard,
  listCustomerProfitability,
} from '../../../../../lib/api/customer-profitability.api';
import { listCustomers } from '../../../../../lib/api/trips.api';
import type { CustomerProfitabilityEntity } from '../../../../../types/entities';
import { formatCurrency, formatPercent } from '../../../../../utils/format';

const PAGE_SIZE = 20;

export default function CustomerProfitabilityPage(): JSX.Element {
  const router = useRouter();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [page, setPage] = useState(1);
  const hasActiveFilters = Boolean(from || to || customerId);

  const dashboardQuery = useQuery({
    queryKey: ['customer-profitability', 'dashboard', { from, to }],
    queryFn: () => getCustomerProfitabilityDashboard({ from: from || undefined, to: to || undefined }),
  });

  const listQuery = useQuery({
    queryKey: ['customer-profitability', 'customers', { page, from, to, customerId }],
    queryFn: ({ signal }) =>
      listCustomerProfitability(
        {
          page,
          pageSize: PAGE_SIZE,
          from: from || undefined,
          to: to || undefined,
          customerId: customerId || undefined,
          sortBy: 'result',
          sortOrder: 'desc',
        },
        signal,
      ),
  });

  const columns = useMemo<ColumnDef<CustomerProfitabilityEntity, unknown>[]>(
    () => [
      { header: 'Cliente', accessorFn: (row) => row.customerName },
      { header: 'Viagens', accessorFn: (row) => row.tripsCount },
      { header: 'Receita', cell: ({ row }) => formatCurrency(row.original.revenue) },
      { header: 'Custo', cell: ({ row }) => formatCurrency(row.original.cost) },
      {
        header: 'Resultado',
        cell: ({ row }) => (
          <span className={row.original.result >= 0 ? 'text-success-600' : 'text-danger-600'}>
            {formatCurrency(row.original.result)}
          </span>
        ),
      },
      {
        header: 'Margem',
        cell: ({ row }) =>
          row.original.marginPercent !== null ? (
            <Badge tone={row.original.marginPercent >= 0 ? 'success' : 'danger'}>
              {formatPercent(row.original.marginPercent)}
            </Badge>
          ) : (
            '—'
          ),
      },
    ],
    [],
  );

  const summary = dashboardQuery.data?.summary;

  return (
    <div>
      <PageHeader
        title="Rentabilidade por Cliente"
        description="Receita e custo real das viagens (mesma metodologia já usada em Frota/Financeiro), consolidados por cliente — nunca um cálculo financeiro novo."
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setFrom('');
          setTo('');
          setCustomerId('');
          setPage(1);
        }}
      >
        <FormField label="De" htmlFor="cprof-from" className="w-full sm:w-40">
          <DatePicker
            id="cprof-from"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Até" htmlFor="cprof-to" className="w-full sm:w-40">
          <DatePicker
            id="cprof-to"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Cliente" htmlFor="cprof-customer" className="w-full sm:w-56">
          <EntitySelect
            id="cprof-customer"
            queryKey={['customers', 'select']}
            queryFn={() => listCustomers({ pageSize: 100 })}
            getOptionValue={(c) => c.id}
            getOptionLabel={(c) => c.name}
            value={customerId}
            onChange={(v) => {
              setCustomerId(v);
              setPage(1);
            }}
            placeholder="Todos"
          />
        </FormField>
      </FilterBar>

      {dashboardQuery.isLoading && <SkeletonCards count={5} />}
      {dashboardQuery.isError && <ErrorState onRetry={() => dashboardQuery.refetch()} />}

      {summary && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Receita" value={formatCurrency(summary.totalRevenue)} tone="brand" />
            <StatCard label="Custo" value={formatCurrency(summary.totalCost)} tone="warning" />
            <StatCard
              label="Resultado"
              value={formatCurrency(summary.totalResult)}
              tone={summary.totalResult >= 0 ? 'success' : 'danger'}
            />
            <StatCard
              label="Margem"
              value={summary.marginPercent !== null ? formatPercent(summary.marginPercent) : '—'}
              tone="info"
            />
            <StatCard label="Viagens · Clientes" value={`${summary.tripsCount} · ${summary.customersCount}`} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarRankingChart
              title="Ranking por resultado"
              description="Top 10 clientes por resultado (receita - custo real)."
              data={(dashboardQuery.data?.topByResult ?? []).map((c) => ({ label: c.customerName, value: c.result }))}
              color="#4f46e5"
              emptyMessage="Nenhum cliente com viagens no período/filtro selecionado."
            />
            <BarRankingChart
              title="Ranking por margem"
              description="Top 10 clientes por margem percentual (apenas com receita válida)."
              data={(dashboardQuery.data?.topByMargin ?? []).map((c) => ({ label: c.customerName, value: c.marginPercent ?? 0 }))}
              color="#16a34a"
              valueFormatter={formatPercent}
              emptyMessage="Nenhum cliente com margem calculável no período/filtro selecionado."
            />
          </div>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={listQuery.data?.items ?? []}
          isLoading={listQuery.isLoading}
          isError={listQuery.isError}
          onRetry={() => listQuery.refetch()}
          getRowId={(r) => r.customerId}
          onRowClick={(r) => router.push(`/customers/${r.customerId}`)}
          emptyTitle="Nenhum cliente com viagens no período/filtro selecionado"
        />
        {listQuery.data && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
      </div>
    </div>
  );
}
