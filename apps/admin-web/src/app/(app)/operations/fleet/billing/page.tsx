'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Banknote, CheckCircle2, TrendingUp, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Card, CardHeader } from '../../../../../components/ui/card';
import { DataTable } from '../../../../../components/ui/data-table';
import { DatePicker } from '../../../../../components/ui/date-picker';
import { EntitySelect } from '../../../../../components/ui/entity-select';
import { ErrorState } from '../../../../../components/ui/error-state';
import { FilterBar } from '../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../components/ui/form-field';
import { PageHeader } from '../../../../../components/ui/page-header';
import { Pagination } from '../../../../../components/ui/pagination';
import { Select } from '../../../../../components/ui/select';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { MonthlyChartCard } from '../../../../../features/dashboard/monthly-chart-card';
import { listDrivers } from '../../../../../lib/api/drivers.api';
import { listFleets, listVehicles } from '../../../../../lib/api/fleet.api';
import { getBillingDashboard, listTripBillings } from '../../../../../lib/api/billing-operational.api';
import { listCustomers } from '../../../../../lib/api/trips.api';
import { TRIP_BILLING_STATUS_LABELS, TRIP_BILLING_STATUS_TONE, labelOrValue } from '../../../../../lib/labels';
import type { TripBillingEntity } from '../../../../../types/entities';
import type { TripBillingStatus } from '../../../../../types/enums';
import { formatCurrency, formatDate } from '../../../../../utils/format';

const PAGE_SIZE = 20;

export default function BillingPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [fleetId, setFleetId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [status, setStatus] = useState<TripBillingStatus | ''>('');

  const filters = {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    customerId: customerId || undefined,
    fleetId: fleetId || undefined,
    vehicleId: vehicleId || undefined,
    driverId: driverId || undefined,
    status: status || undefined,
  };
  const hasActiveFilters = Boolean(startDate || endDate || customerId || fleetId || vehicleId || driverId || status);

  function clearFilters(): void {
    setStartDate('');
    setEndDate('');
    setCustomerId('');
    setFleetId('');
    setVehicleId('');
    setDriverId('');
    setStatus('');
    setPage(1);
  }

  const dashboardQuery = useQuery({
    queryKey: ['billing', 'dashboard', filters],
    queryFn: ({ signal }) => getBillingDashboard(filters, signal),
  });

  const listQuery = useQuery({
    queryKey: ['billing', 'list', { page, ...filters }],
    queryFn: ({ signal }) => listTripBillings({ page, pageSize: PAGE_SIZE, ...filters }, signal),
  });

  const columns = useMemo<ColumnDef<TripBillingEntity, unknown>[]>(
    () => [
      { header: 'Viagem', accessorFn: (row) => row.tripLabel ?? '—' },
      { header: 'Cliente', accessorFn: (row) => row.customerName ?? '—' },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={TRIP_BILLING_STATUS_TONE[row.original.status]}>
            {TRIP_BILLING_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      { header: 'Faturável', cell: ({ row }) => formatCurrency(row.original.billableAmount) },
      { header: 'Faturado', cell: ({ row }) => formatCurrency(row.original.invoicedAmount) },
      { header: 'Saldo', cell: ({ row }) => (row.original.balance !== null ? formatCurrency(row.original.balance) : '—') },
      { header: 'Atualizado em', cell: ({ row }) => (row.original.updatedAt ? formatDate(row.original.updatedAt) : '—') },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Faturamento"
        description="Conciliação comercial da viagem — contratado → calculado → faturado → recebido → saldo. Reaproveita o snapshot comercial da Fase 59, nunca recalcula viagens antigas."
      />

      {dashboardQuery.isLoading && <SkeletonCards />}
      {dashboardQuery.isError && <ErrorState onRetry={() => dashboardQuery.refetch()} />}

      {dashboardQuery.data && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total faturável" value={formatCurrency(dashboardQuery.data.totalBillable)} icon={Banknote} tone="brand" />
            <StatCard label="Total faturado" value={formatCurrency(dashboardQuery.data.totalInvoiced)} icon={CheckCircle2} tone="success" />
            <StatCard label="Total recebido" value={formatCurrency(dashboardQuery.data.totalReceived)} icon={Wallet} />
            <StatCard
              label="Saldo a faturar"
              value={formatCurrency(dashboardQuery.data.balanceToInvoice)}
              icon={AlertTriangle}
              tone={dashboardQuery.data.balanceToInvoice > 0 ? 'warning' : 'success'}
            />
          </div>
          <p className="-mt-2 text-xs text-ink-subtle">
            &quot;Total recebido&quot; é sempre igual ao total faturado — o projeto não integra gateway de
            pagamento/PIX/débito automático nesta fase, então não há confirmação de recebimento distinta do
            registro da receita.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Prontas para faturar" value={String(dashboardQuery.data.readyForInvoicingCount)} />
            <StatCard label="Faturamentos parciais" value={String(dashboardQuery.data.partiallyInvoicedCount)} tone="warning" />
            <StatCard label="Faturamentos pendentes" value={String(dashboardQuery.data.pendingCount)} />
            <StatCard
              label="Margem comercial"
              value={formatCurrency(dashboardQuery.data.commercialMargin)}
              icon={TrendingUp}
              tone={dashboardQuery.data.commercialMargin >= 0 ? 'success' : 'danger'}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <MonthlyChartCard title="Evolução mensal (faturado)" data={dashboardQuery.data.monthlyEvolution} color="#4f46e5" />
            <Card>
              <CardHeader title="Principais clientes" description="Por valor faturado." />
              <ul className="divide-y divide-border">
                {dashboardQuery.data.topCustomers.length === 0 && (
                  <li className="px-5 py-4 text-sm text-ink-subtle">Nenhum faturamento no período.</li>
                )}
                {dashboardQuery.data.topCustomers.map((c) => (
                  <li key={c.customerId} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <span className="truncate">{c.customerName}</span>
                    <span className="shrink-0 font-medium">{formatCurrency(c.totalInvoiced)}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Principais frotas" description="Por valor faturado." />
              <ul className="divide-y divide-border">
                {dashboardQuery.data.topFleets.length === 0 && (
                  <li className="px-5 py-4 text-sm text-ink-subtle">Nenhum faturamento no período.</li>
                )}
                {dashboardQuery.data.topFleets.map((f) => (
                  <li key={f.fleetId ?? 'no-fleet'} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <span className="truncate">{f.fleetName}</span>
                    <span className="shrink-0 font-medium">{formatCurrency(f.totalInvoiced)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {dashboardQuery.data.topVehicles.length > 0 && (
            <Card>
              <CardHeader title="Principais veículos" description="Por valor faturado." />
              <ul className="divide-y divide-border">
                {dashboardQuery.data.topVehicles.map((v) => (
                  <li key={v.vehicleId} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <span className="truncate">{v.plate}</span>
                    <span className="shrink-0 font-medium">{formatCurrency(v.totalInvoiced)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <div className="mt-6">
        <FilterBar hasActiveFilters={hasActiveFilters} onClear={clearFilters}>
          <FormField label="De" htmlFor="billing-filter-from" className="w-full sm:w-40">
            <DatePicker id="billing-filter-from" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} />
          </FormField>
          <FormField label="Até" htmlFor="billing-filter-to" className="w-full sm:w-40">
            <DatePicker id="billing-filter-to" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} />
          </FormField>
          <FormField label="Status" htmlFor="billing-filter-status" className="w-full sm:w-44">
            <Select
              id="billing-filter-status"
              value={status}
              onChange={(e) => { setStatus(e.target.value as TripBillingStatus | ''); setPage(1); }}
            >
              <option value="">Todos</option>
              {(Object.keys(TRIP_BILLING_STATUS_LABELS) as TripBillingStatus[]).map((s) => (
                <option key={s} value={s}>
                  {labelOrValue(TRIP_BILLING_STATUS_LABELS, s)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Cliente" htmlFor="billing-filter-customer" className="w-full sm:w-48">
            <EntitySelect
              id="billing-filter-customer"
              queryKey={['customers', 'select']}
              queryFn={() => listCustomers({ pageSize: 100 })}
              getOptionValue={(c) => c.id}
              getOptionLabel={(c) => c.name}
              value={customerId}
              onChange={(v) => { setCustomerId(v); setPage(1); }}
              placeholder="Todos"
            />
          </FormField>
          <FormField label="Frota" htmlFor="billing-filter-fleet" className="w-full sm:w-44">
            <EntitySelect
              id="billing-filter-fleet"
              queryKey={['fleets', 'select']}
              queryFn={() => listFleets({ pageSize: 100 })}
              getOptionValue={(f) => f.id}
              getOptionLabel={(f) => f.name}
              value={fleetId}
              onChange={(v) => { setFleetId(v); setPage(1); }}
              placeholder="Todas"
            />
          </FormField>
          <FormField label="Veículo" htmlFor="billing-filter-vehicle" className="w-full sm:w-44">
            <EntitySelect
              id="billing-filter-vehicle"
              queryKey={['vehicles', 'select']}
              queryFn={() => listVehicles({ pageSize: 100 })}
              getOptionValue={(v) => v.id}
              getOptionLabel={(v) => v.plate}
              value={vehicleId}
              onChange={(v) => { setVehicleId(v); setPage(1); }}
              placeholder="Todos"
            />
          </FormField>
          <FormField label="Motorista" htmlFor="billing-filter-driver" className="w-full sm:w-44">
            <EntitySelect
              id="billing-filter-driver"
              queryKey={['drivers', 'select']}
              queryFn={() => listDrivers({ pageSize: 100 })}
              getOptionValue={(d) => d.id}
              getOptionLabel={(d) => d.name}
              value={driverId}
              onChange={(v) => { setDriverId(v); setPage(1); }}
              placeholder="Todos"
            />
          </FormField>
        </FilterBar>

        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <DataTable
            columns={columns}
            data={listQuery.data?.items ?? []}
            isLoading={listQuery.isLoading}
            isError={listQuery.isError}
            onRetry={() => listQuery.refetch()}
            getRowId={(b) => b.id ?? b.tripId}
            emptyTitle="Nenhum faturamento encontrado"
            emptyDescription="Não existem faturamentos para os filtros selecionados."
          />
          {listQuery.data && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
        </div>
      </div>
    </div>
  );
}
