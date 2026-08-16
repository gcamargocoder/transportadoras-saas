'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, Info, MapPin, Route as RouteIcon, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Card, CardHeader } from '../../../../../components/ui/card';
import { DataTable } from '../../../../../components/ui/data-table';
import { ErrorState } from '../../../../../components/ui/error-state';
import { PageHeader } from '../../../../../components/ui/page-header';
import { RadialGauge } from '../../../../../components/ui/radial-gauge';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { MonthlyChartCard } from '../../../../../features/dashboard/monthly-chart-card';
import { BarRankingChart } from '../../../../../features/fleet-operations/bar-ranking-chart';
import { FleetFilters } from '../../../../../features/fleet-operations/fleet-filters';
import { useFleetOperationsFilters } from '../../../../../features/fleet-operations/use-fleet-operations-filters';
import { AUDIT_VERDICT_LABELS } from '../../../../../features/tolls/audit-verdict';
import { RECONCILIATION_STATUS_LABELS } from '../../../../../features/tolls/reconciliation-verdict';
import { TOLL_STATUS_TONE } from '../../../../../features/tolls/status';
import { getTollReconciliationDashboard } from '../../../../../lib/api/toll-routes.api';
import { getTollDashboard } from '../../../../../lib/api/tolls.api';
import { TOLL_STATUS_LABELS } from '../../../../../lib/labels';
import type { TollDashboardGroupEntity, TollDashboardStatusGroupEntity } from '../../../../../types/entities';
import { formatCurrency, formatNumber } from '../../../../../utils/format';

export default function FleetTollsPage(): JSX.Element {
  const { startDate, setStartDate, endDate, setEndDate, vehicleId, setVehicleId, fleetId, setFleetId, hasActiveFilters, clear } =
    useFleetOperationsFilters();

  const filters = {
    chargedFrom: startDate || undefined,
    chargedTo: endDate || undefined,
    vehicleId: vehicleId || undefined,
    fleetId: fleetId || undefined,
  };

  const query = useQuery({
    queryKey: ['tolls', 'dashboard', filters],
    queryFn: ({ signal }) => getTollDashboard(filters, signal),
  });

  const reconciliationQuery = useQuery({
    queryKey: ['toll-routes', 'dashboard'],
    queryFn: ({ signal }) => getTollReconciliationDashboard(signal),
  });

  const groupColumns = useMemo<ColumnDef<TollDashboardGroupEntity, unknown>[]>(
    () => [
      { header: 'Nome', accessorFn: (row) => row.label },
      { header: 'Transações', accessorFn: (row) => formatNumber(row.count) },
      { header: 'Valor cobrado', cell: ({ row }) => formatCurrency(row.original.totalChargedAmount) },
    ],
    [],
  );

  const statusColumns = useMemo<ColumnDef<TollDashboardStatusGroupEntity, unknown>[]>(
    () => [
      {
        header: 'Status',
        cell: ({ row }) => <Badge tone={TOLL_STATUS_TONE[row.original.status]}>{TOLL_STATUS_LABELS[row.original.status]}</Badge>,
      },
      { header: 'Transações', accessorFn: (row) => formatNumber(row.count) },
      { header: 'Valor cobrado', cell: ({ row }) => formatCurrency(row.original.totalChargedAmount) },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Pedágios"
        description="Transações de pedágio, conferência de tarifa e conciliação de rotas."
      />

      <FleetFilters
        idPrefix="ftolls"
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
            <StatCard label="Total de transações" value={formatNumber(query.data.totalCount)} icon={RouteIcon} />
            <StatCard label="Valor cobrado" value={formatCurrency(query.data.totalChargedAmount)} icon={Wallet} variant="gradient" />
            <StatCard label="Valor esperado" value={formatCurrency(query.data.totalExpectedAmount)} />
            <StatCard
              label="Diferença total"
              value={formatCurrency(query.data.totalDiscrepancyAmount)}
              tone={query.data.totalDiscrepancyAmount > 0 ? 'warning' : 'success'}
            />
          </div>

          <Card>
            <CardHeader
              title="Conformidade da cobrança"
              description="Percentual de transações cobradas dentro do esperado, entre as que puderam ser conferidas (praça com tarifa por eixo cadastrada)."
            />
            <div className="flex flex-col items-center gap-6 p-5 sm:flex-row">
              <RadialGauge percentage={query.data.conformityPercentage} size={100} />
              <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard label={AUDIT_VERDICT_LABELS.CORRECT} value={formatNumber(query.data.correctCount)} tone="success" icon={CheckCircle2} />
                <StatCard label={AUDIT_VERDICT_LABELS.OVERCHARGE} value={formatNumber(query.data.overchargeCount)} tone="danger" />
                <StatCard label={AUDIT_VERDICT_LABELS.UNDERCHARGE} value={formatNumber(query.data.underchargeCount)} tone="warning" />
                <StatCard label={AUDIT_VERDICT_LABELS.UNVERIFIABLE} value={formatNumber(query.data.unverifiableCount)} />
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarRankingChart
              title="Por praça"
              data={query.data.countByPlaza.map((g) => ({ label: g.label, value: g.totalChargedAmount }))}
              emptyMessage="Nenhuma transação no período/filtro selecionado."
            />
            <BarRankingChart
              title="Por veículo"
              data={query.data.countByVehicle.map((g) => ({ label: g.label, value: g.totalChargedAmount }))}
              color="#0891b2"
              emptyMessage="Nenhuma transação no período/filtro selecionado."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Por operadora de tag" />
              <DataTable columns={groupColumns} data={query.data.countByProvider} emptyTitle="Nenhuma transação no período/filtro selecionado." />
            </Card>
            <Card>
              <CardHeader title="Por motorista" />
              <DataTable columns={groupColumns} data={query.data.countByDriver} emptyTitle="Nenhuma transação no período/filtro selecionado." />
            </Card>
          </div>

          <Card>
            <CardHeader title="Por status" />
            <DataTable columns={statusColumns} data={query.data.countByStatus} emptyTitle="Nenhuma transação no período/filtro selecionado." />
          </Card>

          <MonthlyChartCard title="Evolução mensal do valor cobrado" data={query.data.monthlyTrendChargedAmount} color="#4f46e5" />

          <Card>
            <CardHeader
              title="Conciliação de rotas"
              description="Dado consolidado do tenant inteiro — não filtrado por veículo/frota/período (limitação do endpoint reaproveitado)."
              action={
                reconciliationQuery.data ? (
                  <span className="flex items-center gap-1 text-xs text-ink-subtle">
                    <Info size={12} />
                    {`${formatNumber(reconciliationQuery.data.conformityPercentage, 1)}% conforme`}
                  </span>
                ) : undefined
              }
            />
            {reconciliationQuery.isLoading && (
              <div className="p-5">
                <SkeletonCards count={4} />
              </div>
            )}
            {reconciliationQuery.data && (
              <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
                <StatCard label={RECONCILIATION_STATUS_LABELS.CONFORM} value={formatNumber(reconciliationQuery.data.conformTripsCount)} tone="success" />
                <StatCard label={RECONCILIATION_STATUS_LABELS.ATTENTION} value={formatNumber(reconciliationQuery.data.attentionTripsCount)} tone="warning" />
                <StatCard label={RECONCILIATION_STATUS_LABELS.CRITICAL} value={formatNumber(reconciliationQuery.data.criticalTripsCount)} tone="danger" />
                <StatCard label={RECONCILIATION_STATUS_LABELS.PENDING} value={formatNumber(reconciliationQuery.data.pendingTripsCount)} />
                <StatCard label={RECONCILIATION_STATUS_LABELS.UNVERIFIABLE} value={formatNumber(reconciliationQuery.data.unverifiableTripsCount)} />
                <StatCard label="Praças não registradas" value={formatNumber(reconciliationQuery.data.totalNotRegisteredStops)} icon={MapPin} />
              </div>
            )}
          </Card>

          <div className="flex justify-end">
            <Link href="/tolls" className="text-sm font-medium text-brand-600 hover:underline">
              Ver todas as transações →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
