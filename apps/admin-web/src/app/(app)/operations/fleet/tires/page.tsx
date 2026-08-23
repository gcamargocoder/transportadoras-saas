'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CircleDot, Info, Recycle, ShieldAlert, Trash2, Wallet, Wrench } from 'lucide-react';
import Link from 'next/link';
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
import { Select } from '../../../../../components/ui/select';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { MonthlyChartCard } from '../../../../../features/dashboard/monthly-chart-card';
import { BarRankingChart } from '../../../../../features/fleet-operations/bar-ranking-chart';
import { RankingCard } from '../../../../../features/fleet-operations/ranking-card';
import { TireWearGaugeCard } from '../../../../../features/fleet-operations/tire-wear-gauge-card';
import { useFleetOperationsFilters } from '../../../../../features/fleet-operations/use-fleet-operations-filters';
import { getFleetOperationsTires } from '../../../../../lib/api/fleet-operations.api';
import { listFleets, listVehicles } from '../../../../../lib/api/fleet.api';
import { TIRE_STATUS_LABELS } from '../../../../../lib/labels';
import type { FleetAlertSeverity, FleetTireFleetBreakdownEntity } from '../../../../../types/entities';
import type { TireStatus } from '../../../../../types/enums';
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

function nullableMetric(value: number | null, suffix = ''): string {
  return value === null ? 'Indisponível' : `${formatNumber(value, 0)}${suffix}`;
}

export default function FleetTiresOverviewPage(): JSX.Element {
  const { startDate, setStartDate, endDate, setEndDate, vehicleId, setVehicleId, fleetId, setFleetId, hasActiveFilters, clear } =
    useFleetOperationsFilters();
  const [tireStatus, setTireStatus] = useState<TireStatus | ''>('');

  const filters = {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    vehicleId: vehicleId || undefined,
    fleetId: fleetId || undefined,
    tireStatus: tireStatus || undefined,
  };

  const query = useQuery({
    queryKey: ['fleet-operations', 'tires', filters],
    queryFn: ({ signal }) => getFleetOperationsTires(filters, signal),
  });

  const fleetColumns = useMemo<ColumnDef<FleetTireFleetBreakdownEntity, unknown>[]>(
    () => [
      { header: 'Frota', accessorFn: (row) => row.fleetName },
      { header: 'Pneus', accessorFn: (row) => formatNumber(row.count) },
      { header: 'Custo (compra)', cell: ({ row }) => formatCurrency(row.original.cost) },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Pneus — visão geral"
        description="Composição, custo, evolução mensal e desgaste (leitura direta de inspeção, nunca estimado) da frota de pneus."
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters || Boolean(tireStatus)}
        onClear={() => {
          clear();
          setTireStatus('');
        }}
      >
        <FormField label="De" htmlFor="ftires-start">
          <DatePicker id="ftires-start" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </FormField>
        <FormField label="Até" htmlFor="ftires-end">
          <DatePicker id="ftires-end" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </FormField>
        <FormField label="Veículo" htmlFor="ftires-vehicle" className="w-full sm:w-48">
          <EntitySelect
            id="ftires-vehicle"
            queryKey={['vehicles', 'select']}
            queryFn={() => listVehicles({ pageSize: 100 })}
            getOptionValue={(v) => v.id}
            getOptionLabel={(v) => v.plate}
            value={vehicleId}
            onChange={setVehicleId}
            placeholder="Todos"
          />
        </FormField>
        <FormField label="Frota" htmlFor="ftires-fleet" className="w-full sm:w-48">
          <EntitySelect
            id="ftires-fleet"
            queryKey={['fleets', 'select']}
            queryFn={() => listFleets({ pageSize: 100 })}
            getOptionValue={(f) => f.id}
            getOptionLabel={(f) => f.name}
            value={fleetId}
            onChange={setFleetId}
            placeholder="Todas"
          />
        </FormField>
        <FormField label="Status do pneu" htmlFor="ftires-status" className="w-full sm:w-48">
          <Select id="ftires-status" value={tireStatus} onChange={(e) => setTireStatus(e.target.value as TireStatus | '')}>
            <option value="">Todos</option>
            {(Object.keys(TIRE_STATUS_LABELS) as TireStatus[]).map((s) => (
              <option key={s} value={s}>
                {TIRE_STATUS_LABELS[s]}
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
            <StatCard label="Total de pneus" value={formatNumber(query.data.totalTires)} icon={CircleDot} variant="gradient" />
            <StatCard label="Novos" value={formatNumber(query.data.newCount)} />
            <StatCard label="Em uso" value={formatNumber(query.data.inUseCount)} tone="success" />
            <StatCard label="Estoque" value={formatNumber(query.data.stockCount)} />
            <StatCard label="Recapados" value={formatNumber(query.data.retreadedCount)} icon={Recycle} />
            <StatCard label="Sucateados" value={formatNumber(query.data.scrappedCount)} icon={Trash2} />
            <StatCard
              label="Próximos da troca"
              value={formatNumber(query.data.nearReplacementCount)}
              icon={Wrench}
              tone={query.data.nearReplacementCount > 0 ? 'warning' : 'success'}
            />
            <StatCard label="Valor investido" value={formatCurrency(query.data.investedValue)} icon={Wallet} />
            <StatCard label="Valor de recapagem" value={formatCurrency(query.data.retreadValue)} />
            <StatCard
              label="Custo médio por pneu"
              value={query.data.averageCostPerTire !== null ? formatCurrency(query.data.averageCostPerTire) : 'Indisponível'}
            />
            <StatCard label="Vida útil média planejada" value={nullableMetric(query.data.averageLifespanKm, ' km')} />
          </div>

          <Card>
            <CardHeader
              title="Desgaste dos pneus"
              description="Sulco atual sobre sulco inicial, a partir da última inspeção registrada — leitura direta, nunca estimada. Só pneus em uso."
            />
            {query.data.tireWear.length === 0 ? (
              <p className="p-5 text-sm text-ink-muted">Nenhum pneu em uso no período/filtro selecionado.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-6">
                {query.data.tireWear.map((tire) => (
                  <TireWearGaugeCard key={tire.tireId} tire={tire} />
                ))}
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarRankingChart
              title="Por status"
              data={query.data.byStatus.map((s) => ({ label: TIRE_STATUS_LABELS[s.status], value: s.count }))}
              valueFormatter={(v) => formatNumber(v)}
              emptyMessage="Nenhum pneu no filtro selecionado."
            />
            <Card>
              <CardHeader title="Por frota" description='Só pneus atualmente montados em veículo. "Sem frota" quando o veículo não tem frota.' />
              <DataTable columns={fleetColumns} data={query.data.byFleet} emptyTitle="Nenhum pneu montado no filtro selecionado." />
            </Card>
          </div>

          <BarRankingChart
            title="Por posição"
            data={query.data.byPosition.map((p) => ({ label: p.position, value: p.count }))}
            valueFormatter={(v) => formatNumber(v)}
            emptyMessage="Nenhum pneu montado com posição informada no filtro selecionado."
          />

          <MonthlyChartCard
            title="Evolução mensal do custo (compra + recapagem)"
            data={query.data.monthlyTrendCost}
            color="#0891b2"
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RankingCard
              title="Veículos com maior custo de pneus"
              icon={Wallet}
              entries={query.data.topVehiclesByTireCost}
              formatValue={(v) => formatCurrency(v)}
              getHref={(entry) => `/vehicles/${entry.vehicleId}`}
              emptyMessage="Nenhum pneu montado em veículo no filtro selecionado."
            />

            <Card>
              <CardHeader title="Pneus próximos da troca" description="Sulco atual dentro do limiar de segurança." />
              {query.data.tireAlerts.length === 0 ? (
                <div className="flex items-center gap-2 p-5 text-sm text-ink-muted">
                  <Info size={16} />
                  Nenhum pneu próximo da troca no período/filtro selecionado.
                </div>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {query.data.tireAlerts.map((alert, index) => (
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

          <div className="flex justify-end">
            <Link href="/tires" className="text-sm font-medium text-brand-600 hover:underline">
              Ver todos os pneus →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
