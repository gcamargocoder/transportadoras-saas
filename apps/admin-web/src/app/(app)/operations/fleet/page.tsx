'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CircleDot,
  Clock,
  ClipboardCheck,
  Container,
  Fuel,
  Gauge,
  Info,
  ParkingSquare,
  Route as RouteIcon,
  ShieldAlert,
  Truck,
  UserRound,
  Wallet,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '../../../../components/ui/badge';
import { Card, CardHeader } from '../../../../components/ui/card';
import { ErrorState } from '../../../../components/ui/error-state';
import { PageHeader } from '../../../../components/ui/page-header';
import { RadialGauge } from '../../../../components/ui/radial-gauge';
import { SkeletonCards } from '../../../../components/ui/skeleton';
import { StatCard } from '../../../../components/ui/stat-card';
import { FleetFilters } from '../../../../features/fleet-operations/fleet-filters';
import { useFleetOperationsFilters } from '../../../../features/fleet-operations/use-fleet-operations-filters';
import {
  getFleetOperationsCompositions,
  getFleetOperationsDashboard,
  getFleetOperationsDowntimeCost,
  getFleetOperationsFuel,
  getFleetOperationsIndicators,
} from '../../../../lib/api/fleet-operations.api';
import { getTollDashboard } from '../../../../lib/api/tolls.api';
import { TRIP_STOP_TYPE_LABELS } from '../../../../lib/labels';
import type { FleetAlertSeverity } from '../../../../types/entities';
import { formatCurrency, formatNumber } from '../../../../utils/format';

function nullableCurrency(value: number | null): string {
  return value === null ? '—' : formatCurrency(value);
}

function nullableNumber(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${formatNumber(value, 1)}${suffix}`;
}

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

export default function FleetOperationsDashboardPage(): JSX.Element {
  const { startDate, setStartDate, endDate, setEndDate, vehicleId, setVehicleId, fleetId, setFleetId, filters, hasActiveFilters, clear } =
    useFleetOperationsFilters();

  const query = useQuery({
    queryKey: ['fleet-operations', 'dashboard', filters],
    queryFn: ({ signal }) => getFleetOperationsDashboard(filters, signal),
  });

  const operationalQuery = useQuery({
    queryKey: ['fleet-operations', 'operations', filters],
    queryFn: ({ signal }) => getFleetOperationsIndicators(filters, signal),
  });

  const fuelQuery = useQuery({
    queryKey: ['fleet-operations', 'fuel', filters],
    queryFn: ({ signal }) => getFleetOperationsFuel(filters, signal),
  });

  const downtimeCostQuery = useQuery({
    queryKey: ['fleet-operations', 'downtime-cost', filters],
    queryFn: ({ signal }) => getFleetOperationsDowntimeCost(filters, signal),
  });

  const tollsQuery = useQuery({
    queryKey: ['tolls', 'dashboard', filters],
    queryFn: ({ signal }) =>
      getTollDashboard(
        { chargedFrom: filters.startDate, chargedTo: filters.endDate, vehicleId: filters.vehicleId, fleetId: filters.fleetId },
        signal,
      ),
  });

  const compositionsQuery = useQuery({
    queryKey: ['fleet-operations', 'compositions', filters],
    queryFn: ({ signal }) => getFleetOperationsCompositions(filters, signal),
  });

  // Fase 43 -- "principal motivo" = tipo com mais OCORRENCIAS (nao maior
  // duracao total) no periodo/filtro; "—" quando nao ha nenhuma parada.
  const mainStopType = query.data?.stops.byType.length
    ? [...query.data.stops.byType].sort((a, b) => b.count - a.count)[0]
    : null;
  const stalledAlertsCount = query.data?.alerts.filter((a) => a.type === 'STALLED_VEHICLE').length ?? 0;

  return (
    <div>
      <PageHeader
        title="Gestão da frota"
        description="Painel executivo: visão geral, custos, operação, alertas e ranking de veículos."
      />

      <FleetFilters
        idPrefix="fops"
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
          {/* ===== Secao 1: KPIs ===== */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                Visão geral
              </h2>
              <Link href="/operations/fleet/vehicles" className="text-xs font-medium text-brand-600 hover:underline">
                Ver detalhes →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Veículos ativos"
                value={`${formatNumber(query.data.overview.activeVehicles)} / ${formatNumber(query.data.overview.totalVehicles)}`}
                icon={Truck}
              />
              <StatCard
                label="Em viagem"
                value={formatNumber(query.data.overview.vehiclesOnTrip)}
                icon={RouteIcon}
                tone="info"
              />
              <StatCard label="Disponíveis" value={formatNumber(query.data.overview.vehiclesAvailable)} tone="success" />
              <StatCard
                label="Em manutenção"
                value={formatNumber(query.data.overview.maintenanceVehicles)}
                icon={Wrench}
                tone={query.data.overview.maintenanceVehicles > 0 ? 'warning' : 'success'}
              />
              <StatCard
                label="Viagens ativas"
                value={formatNumber(query.data.overview.activeTrips)}
                icon={Gauge}
                tone="info"
              />
              <StatCard label="Motoristas ativos" value={formatNumber(query.data.overview.activeDrivers)} icon={UserRound} />
              <StatCard
                label="Alertas em aberto"
                value={formatNumber(query.data.overview.openAlerts)}
                icon={AlertTriangle}
                tone={query.data.overview.openAlerts > 0 ? 'danger' : 'success'}
              />
              <StatCard label="Custo total" value={formatCurrency(query.data.costs.totalCost)} icon={Wallet} />
            </div>
          </section>

          {/* ===== Secao 2: Custos ===== */}
          <section>
            <Card>
              <CardHeader
                title="Custos realizados"
                description="Combustível + manutenção + pneus + pedágio + outras despesas aprovadas. Nunca inclui valores previstos/estimados."
                action={
                  <Link href="/operations/fleet/costs" className="text-xs font-medium text-brand-600 hover:underline">
                    Ver detalhes →
                  </Link>
                }
              />
              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Combustível" value={formatCurrency(query.data.costs.fuelCost)} icon={Fuel} />
                <StatCard label="Manutenção" value={formatCurrency(query.data.costs.maintenanceCost)} icon={Wrench} />
                <StatCard label="Pneus" value={formatCurrency(query.data.costs.tireCost)} />
                <StatCard label="Pedágio" value={formatCurrency(query.data.costs.tollCost)} />
                <StatCard label="Outras despesas" value={formatCurrency(query.data.costs.otherCost)} />
                <StatCard label="Custo médio/veículo" value={nullableCurrency(query.data.costs.averageCostPerVehicle)} />
                {query.data.costs.previousPeriod && (
                  <StatCard
                    label="Variação vs período anterior"
                    value={
                      query.data.costs.previousPeriod.deltaPercent === null
                        ? '—'
                        : `${query.data.costs.previousPeriod.deltaPercent >= 0 ? '+' : ''}${formatNumber(query.data.costs.previousPeriod.deltaPercent, 1)}%`
                    }
                    tone={
                      query.data.costs.previousPeriod.deltaPercent === null
                        ? 'brand'
                        : query.data.costs.previousPeriod.deltaPercent > 0
                          ? 'danger'
                          : 'success'
                    }
                  />
                )}
              </div>
            </Card>
          </section>

          {/* ===== Secao 3: Operacao ===== */}
          <section>
            <Card>
              <CardHeader title="Operação" description="Indicadores operacionais do período/filtro selecionado." />
              {operationalQuery.isLoading && (
                <div className="p-5">
                  <SkeletonCards count={4} />
                </div>
              )}
              {operationalQuery.data && (
                <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
                  <StatCard label="Concluídas" value={formatNumber(operationalQuery.data.completedTrips)} tone="success" />
                  <StatCard label="Em andamento" value={formatNumber(operationalQuery.data.inProgressTrips)} icon={Gauge} tone="info" />
                  <StatCard label="Canceladas" value={formatNumber(operationalQuery.data.cancelledTrips)} />
                  <StatCard
                    label="Tempo médio de viagem"
                    value={nullableNumber(operationalQuery.data.averageTripDurationMinutes, ' min')}
                    icon={Clock}
                  />
                  <StatCard label="Custo médio/viagem" value={nullableCurrency(operationalQuery.data.averageCostPerTrip)} />
                  <StatCard
                    label="Utilização da frota"
                    value={operationalQuery.data.utilizationPercent === null ? '—' : `${formatNumber(operationalQuery.data.utilizationPercent, 1)}%`}
                  />
                </div>
              )}
            </Card>
          </section>

          {/* ===== Secao 3.5: Paradas (Fase 43) ===== */}
          <section>
            <Card>
              <CardHeader
                title="Paradas"
                description="Tempo parado da frota no período/filtro selecionado."
                action={
                  <Link href="/operations/fleet/stops" className="text-xs font-medium text-brand-600 hover:underline">
                    Ver detalhes →
                  </Link>
                }
              />
              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Total de paradas" value={formatNumber(query.data.stops.totalStops)} icon={ParkingSquare} />
                <StatCard label="Tempo total parado" value={`${formatNumber(query.data.stops.totalDurationMinutes)} min`} />
                <StatCard
                  label="Tempo médio"
                  value={query.data.stops.averageDurationMinutes === null ? '—' : `${formatNumber(query.data.stops.averageDurationMinutes, 1)} min`}
                  icon={Clock}
                />
                <StatCard
                  label="Principal motivo"
                  value={
                    mainStopType
                      ? TRIP_STOP_TYPE_LABELS[mainStopType.type]
                      : '—'
                  }
                />
                <StatCard
                  label="Veículo mais parado"
                  value={query.data.stops.topVehiclesByDuration[0]?.plate ?? '—'}
                />
                <StatCard
                  label="Motorista mais parado"
                  value={query.data.stops.driverRanking[0]?.driverName ?? '—'}
                />
                <StatCard
                  label="Paradas em aberto há muito tempo"
                  value={formatNumber(stalledAlertsCount)}
                  icon={AlertTriangle}
                  tone={stalledAlertsCount > 0 ? 'danger' : 'success'}
                />
                <StatCard
                  label="Alertas de duração longa"
                  value={formatNumber(query.data.stops.durationAlerts.length)}
                  icon={AlertTriangle}
                  tone={query.data.stops.durationAlerts.length > 0 ? 'danger' : 'success'}
                />
              </div>
            </Card>
          </section>

          {/* ===== Secao 3.55: Tempo parado e receita perdida ===== */}
          <section>
            <Card>
              <CardHeader
                title="Tempo parado e receita perdida"
                description="Receita não gerada ESTIMADA por causa de paradas — taxa de receita/hora do próprio veículo."
                action={
                  <Link href="/operations/fleet/downtime-cost" className="text-xs font-medium text-brand-600 hover:underline">
                    Ver detalhes →
                  </Link>
                }
              />
              {downtimeCostQuery.isLoading && (
                <div className="p-5">
                  <SkeletonCards count={4} />
                </div>
              )}
              {downtimeCostQuery.data && (
                <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard label="Tempo total parado" value={`${formatNumber(downtimeCostQuery.data.totalDowntimeMinutes)} min`} icon={Clock} />
                  <StatCard
                    label="Receita perdida estimada"
                    value={
                      downtimeCostQuery.data.totalEstimatedLostRevenue.available && downtimeCostQuery.data.totalEstimatedLostRevenue.value !== null
                        ? formatCurrency(downtimeCostQuery.data.totalEstimatedLostRevenue.value)
                        : 'Indisponível'
                    }
                    icon={Wallet}
                  />
                  <StatCard
                    label="Veículo com maior receita perdida"
                    value={downtimeCostQuery.data.topVehiclesByLostRevenue[0]?.plate ?? '—'}
                  />
                  <StatCard
                    label="Alertas"
                    value={formatNumber(downtimeCostQuery.data.downtimeCostAlerts.length)}
                    icon={AlertTriangle}
                    tone={downtimeCostQuery.data.downtimeCostAlerts.length > 0 ? 'danger' : 'success'}
                  />
                </div>
              )}
            </Card>
          </section>

          {/* ===== Secao 3.6: Manutencao (Fase 45) ===== */}
          <section>
            <Card>
              <CardHeader
                title="Manutenção"
                description="Manutenções preventivas e corretivas da frota no período/filtro selecionado."
                action={
                  <Link href="/operations/fleet/maintenance" className="text-xs font-medium text-brand-600 hover:underline">
                    Ver detalhes →
                  </Link>
                }
              />
              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Custo total" value={formatCurrency(query.data.maintenance.totalCost)} icon={Wrench} />
                <StatCard
                  label="Preventivas vencidas"
                  value={formatNumber(query.data.maintenance.overdueCount)}
                  icon={AlertTriangle}
                  tone={query.data.maintenance.overdueCount > 0 ? 'danger' : 'success'}
                />
                <StatCard label="Corretivas" value={formatNumber(query.data.maintenance.correctiveCount)} />
                <StatCard label="Veículo com maior custo" value={query.data.maintenance.topVehiclesByCost[0]?.plate ?? '—'} />
                <StatCard
                  label="Tempo total parado"
                  value={query.data.maintenance.totalDowntimeMinutes === null ? '—' : `${formatNumber(query.data.maintenance.totalDowntimeMinutes)} min`}
                  icon={Clock}
                />
                <StatCard
                  label="Alertas críticos"
                  value={formatNumber(query.data.maintenance.maintenanceAlerts.filter((a) => a.severity === 'CRITICAL').length)}
                  icon={AlertTriangle}
                  tone={query.data.maintenance.maintenanceAlerts.some((a) => a.severity === 'CRITICAL') ? 'danger' : 'success'}
                />
              </div>
            </Card>
          </section>

          {/* ===== Secao 4: Alertas ===== */}
          <section>
            <Card>
              <CardHeader
                title="Alertas operacionais"
                description="Calculados a partir dos dados do período/filtro — nunca persistidos."
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
          </section>

          {/* ===== Secao 5: Rankings ===== */}
          <section>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <RankingCard
                title="Top custo total"
                icon={Wallet}
                entries={query.data.costs.topVehiclesByCost}
                formatValue={(v) => formatCurrency(v)}
              />
              <RankingCard
                title="Top nº de manutenções"
                icon={Wrench}
                entries={query.data.maintenance.topVehiclesByCount}
                formatValue={(v) => formatNumber(v)}
              />
              <RankingCard
                title="Top tempo parado"
                icon={ParkingSquare}
                entries={query.data.stops.topVehiclesByDuration}
                formatValue={(v) => `${formatNumber(v)} min`}
              />
            </div>
          </section>

          {/* ===== Abastecimento/Pneus/Checklist (reaproveitados) ===== */}
          <section>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader
                  title="Abastecimento"
                  description="Resumo do período/filtro. Consumo e custo/km só quando há hodômetro suficiente (≥ 2 abastecimentos)."
                  action={
                    <Link href="/operations/fleet/fuel" className="text-xs font-medium text-brand-600 hover:underline">
                      Ver detalhes →
                    </Link>
                  }
                />
                {fuelQuery.isLoading && (
                  <div className="p-5">
                    <SkeletonCards count={4} />
                  </div>
                )}
                {fuelQuery.data && (
                  <div className="flex items-center gap-4 p-5">
                    <div className="grid flex-1 grid-cols-2 gap-4">
                      <StatCard label="Litros abastecidos" value={`${formatNumber(fuelQuery.data.summary.totalLiters, 1)} L`} icon={Fuel} />
                      <StatCard label="Custo total" value={formatCurrency(fuelQuery.data.summary.totalCost)} />
                      <StatCard
                        label="Consumo médio"
                        value={
                          fuelQuery.data.consumption.available && fuelQuery.data.consumption.value !== null
                            ? `${formatNumber(fuelQuery.data.consumption.value, 1)} km/L`
                            : 'Indisponível'
                        }
                      />
                      <StatCard
                        label="Custo de combustível/km"
                        value={
                          fuelQuery.data.costPerKm.available && fuelQuery.data.costPerKm.value !== null
                            ? nullableCurrency(fuelQuery.data.costPerKm.value)
                            : 'Indisponível'
                        }
                      />
                    </div>
                    <div className="hidden shrink-0 flex-col items-center sm:flex">
                      {fuelQuery.data.tankFleetAverage.available && fuelQuery.data.tankFleetAverage.value !== null ? (
                        <RadialGauge percentage={fuelQuery.data.tankFleetAverage.value} size={80} />
                      ) : (
                        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-border text-xs text-ink-subtle">
                          —
                        </div>
                      )}
                      <p className="mt-1.5 text-center text-[11px] text-ink-subtle">Nível médio</p>
                    </div>
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader
                  title="Pneus"
                  description="Resumo do estoque/uso da frota de pneus."
                  action={
                    <Link href="/operations/fleet/tires" className="text-xs font-medium text-brand-600 hover:underline">
                      Ver detalhes →
                    </Link>
                  }
                />
                <div className="grid grid-cols-2 gap-4 p-5">
                  <StatCard label="Em uso" value={formatNumber(query.data.tires.inUseCount)} icon={CircleDot} />
                  <StatCard label="Em estoque" value={formatNumber(query.data.tires.stockCount)} />
                  <StatCard label="Valor investido" value={formatCurrency(query.data.tires.investedValue)} />
                  <StatCard
                    label="Perto da troca"
                    value={formatNumber(query.data.tires.nearReplacementCount)}
                    tone={query.data.tires.nearReplacementCount > 0 ? 'warning' : 'success'}
                  />
                </div>
              </Card>
            </div>
          </section>

          <section>
            <Card>
              <CardHeader
                title="Pedágios"
                description="Transações de pedágio e conformidade da cobrança no período/filtro selecionado."
                action={
                  <Link href="/operations/fleet/tolls" className="text-xs font-medium text-brand-600 hover:underline">
                    Ver detalhes →
                  </Link>
                }
              />
              {tollsQuery.isLoading && (
                <div className="p-5">
                  <SkeletonCards count={4} />
                </div>
              )}
              {tollsQuery.data && (
                <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
                  <StatCard label="Transações" value={formatNumber(tollsQuery.data.totalCount)} />
                  <StatCard label="Valor cobrado" value={formatCurrency(tollsQuery.data.totalChargedAmount)} />
                  <StatCard
                    label="Conformidade"
                    value={`${formatNumber(tollsQuery.data.conformityPercentage, 1)}%`}
                    tone={tollsQuery.data.conformityPercentage >= 90 ? 'success' : 'warning'}
                  />
                  <StatCard
                    label="Cobranças acima do esperado"
                    value={formatNumber(tollsQuery.data.overchargeCount)}
                    tone={tollsQuery.data.overchargeCount > 0 ? 'danger' : 'success'}
                  />
                </div>
              )}
            </Card>
          </section>

          <section>
            <Card>
              <CardHeader
                title="Composição"
                description="Uso de veículo+carreta por viagem: disponibilidade e ranking de carretas no período/filtro selecionado."
                action={
                  <Link href="/operations/fleet/compositions" className="text-xs font-medium text-brand-600 hover:underline">
                    Ver detalhes →
                  </Link>
                }
              />
              {compositionsQuery.isLoading && (
                <div className="p-5">
                  <SkeletonCards count={4} />
                </div>
              )}
              {compositionsQuery.data && (
                <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
                  <StatCard label="Total de carretas" value={formatNumber(compositionsQuery.data.totalTrailers)} icon={Container} />
                  <StatCard label="Ativas" value={formatNumber(compositionsQuery.data.activeCount)} tone="success" />
                  <StatCard label="Em viagem" value={formatNumber(compositionsQuery.data.trailersOnTrip)} icon={RouteIcon} tone="info" />
                  <StatCard label="Disponíveis" value={formatNumber(compositionsQuery.data.trailersAvailable)} />
                </div>
              )}
            </Card>
          </section>

          <section>
            <Card>
              <CardHeader title="Checklist operacional" description="Execuções de checklist da frota (Fase 38/39)." />
              <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
                <StatCard label="Execuções" value={formatNumber(query.data.checklist.totalExecutions)} icon={ClipboardCheck} />
                <StatCard label="Concluídas" value={formatNumber(query.data.checklist.completedExecutions)} tone="success" />
                <StatCard label="Pendentes" value={formatNumber(query.data.checklist.pendingExecutions)} />
                <StatCard
                  label="Não conformidades críticas"
                  value={formatNumber(query.data.checklist.criticalNonConformityCount)}
                  icon={AlertTriangle}
                  tone={query.data.checklist.criticalNonConformityCount > 0 ? 'danger' : 'success'}
                />
              </div>
            </Card>
          </section>
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
}: {
  title: string;
  icon: LucideIcon;
  entries: { vehicleId: string; plate: string; value: number }[];
  formatValue: (value: number) => string;
}): JSX.Element {
  return (
    <Card>
      <CardHeader title={title} />
      {entries.length === 0 ? (
        <p className="p-5 text-sm text-ink-muted">Sem dados no período/filtro selecionado.</p>
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
