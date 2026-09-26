'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertOctagon, AlertTriangle, CircleDollarSign, Milestone, PackageCheck, Receipt, Route as RouteIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { EntitySelect } from '../../components/ui/entity-select';
import { ErrorState } from '../../components/ui/error-state';
import { Skeleton } from '../../components/ui/skeleton';
import { getKpiSeries, getKpiSummary } from '../../lib/api/bi.api';
import { listFleets } from '../../lib/api/fleet.api';
import type { FleetEntity, KpiGranularity, KpiResultEntity, VehicleEntity } from '../../types/entities';
import { DeadlineVehicleTable } from './deadline-vehicle-table';
import { TrendLegend, TrendLineChart } from './financial-charts';
import { FleetVehiclePicker } from './fleet-vehicle-picker';
import { KpiCard } from './kpi-card';
import { indexKpis } from './kpi-format';
import { OnTimePanel } from './on-time-panel';
import { PeriodComparisonChart } from './period-comparison-chart';
import type { PeriodRange } from './period';
import { GRANULARITY_LABELS, isGranularityAllowed, toSeriesRows } from './series-format';

const SUMMARY = [
  { id: 'deliveries_completed', icon: PackageCheck },
  { id: 'trips_completed', icon: RouteIcon },
  { id: 'occurrences_total', icon: AlertTriangle },
  { id: 'occurrences_critical', icon: AlertOctagon },
];

// Contexto operacional (secao 5): mesmos KPIs do summary global, so
// reorganizados para apontar onde continuar a investigacao (Frota/Custos/
// Financeiro) -- nunca uma segunda formula.
const CONTEXT = [
  { id: 'distance_km', icon: Milestone },
  { id: 'operating_cost', icon: Receipt },
  { id: 'revenue', icon: CircleDollarSign },
];

const SERIES_KPIS = ['on_time_delivery_rate', 'occurrences_total', 'occurrences_critical'];
const SUMMARY_KPIS = ['on_time_delivery_rate', ...SUMMARY.map((s) => s.id), ...CONTEXT.map((s) => s.id)];

function Block({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <p className="text-sm text-ink-muted">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function GranularityControl({
  value,
  range,
  onChange,
}: {
  value: KpiGranularity;
  range: PeriodRange;
  onChange: (value: KpiGranularity) => void;
}): JSX.Element {
  const options: KpiGranularity[] = ['day', 'week', 'month'];
  return (
    <div role="radiogroup" aria-label="Agrupar evolução por" className="flex rounded-lg border border-border bg-surface-muted p-0.5">
      {options.map((option) => {
        const allowed = isGranularityAllowed(option, range.startDate, range.endDate);
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            disabled={!allowed}
            title={allowed ? undefined : 'Período longo demais para esse agrupamento'}
            onClick={() => onChange(option)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-40 ${
              value === option ? 'bg-white text-ink shadow-xs' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {GRANULARITY_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}

// BI 6 -- aba Prazos. Filtro local (mesmo padrao de Frota/Custos): sem
// selecao, reaproveita o summary global da pagina; com selecao, dispara UM
// summary adicional escopado por veiculo/frota -- mesmo GET /bi/kpis/summary
// com vehicleId/fleetId a mais, nenhuma formula nova.
export function DeadlinesTab({
  kpis,
  range,
  granularity,
  onGranularityChange,
  onExplain,
}: {
  kpis: Map<string, KpiResultEntity>;
  range: PeriodRange;
  granularity: KpiGranularity | null;
  onGranularityChange: (value: KpiGranularity) => void;
  onExplain: (kpi: KpiResultEntity) => void;
}): JSX.Element {
  const [vehicle, setVehicle] = useState<VehicleEntity | null>(null);
  const [fleetId, setFleetId] = useState('');
  const [showPrevious, setShowPrevious] = useState(true);
  const hasFilter = Boolean(vehicle || fleetId);
  const requestedGranularity = granularity && isGranularityAllowed(granularity, range.startDate, range.endDate) ? granularity : undefined;

  const scopedSummary = useQuery({
    queryKey: ['bi', 'kpis', 'summary', 'deadlines-scope', range, vehicle?.id, fleetId],
    queryFn: ({ signal }) =>
      getKpiSummary({ ...range, kpis: SUMMARY_KPIS.join(','), vehicleId: vehicle?.id, fleetId: fleetId || undefined }, signal),
    enabled: hasFilter,
    staleTime: 60_000,
  });
  const activeKpis = hasFilter ? indexKpis(scopedSummary.data?.kpis) : kpis;

  const series = useQuery({
    queryKey: ['bi', 'kpis', 'series', 'deadlines', range, requestedGranularity ?? 'auto', vehicle?.id, fleetId],
    queryFn: ({ signal }) =>
      getKpiSeries(
        { ...range, kpis: SERIES_KPIS.join(','), granularity: requestedGranularity, comparison: 'PREVIOUS_PERIOD', vehicleId: vehicle?.id, fleetId: fleetId || undefined },
        signal,
      ),
    staleTime: 60_000,
  });
  const seriesData = series.data;
  const effectiveGranularity = seriesData?.granularity ?? requestedGranularity ?? 'day';
  const byId = new Map((seriesData?.series ?? []).map((s) => [s.id, s]));
  const pointCount = seriesData?.series[0]?.points.length ?? 0;
  const onTimeSeries = byId.get('on_time_delivery_rate');
  const occurrencesSeries = byId.get('occurrences_total');
  const criticalSeries = byId.get('occurrences_critical');

  const card = (id: string, icon: (typeof SUMMARY)[number]['icon']) => {
    const kpi = activeKpis.get(id);
    return kpi ? <KpiCard key={id} kpi={kpi} icon={icon} onExplain={onExplain} /> : null;
  };

  const volumeKpis = ['deliveries_completed', 'trips_completed']
    .map((id) => activeKpis.get(id))
    .filter((kpi): kpi is KpiResultEntity => kpi !== undefined);

  return (
    <div className="flex flex-col gap-10">
      <Block
        title="Filtro de prazos"
        description="Restringe os indicadores desta aba a um veículo ou frota. Sem seleção, mostra a operação inteira."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <FleetVehiclePicker
              selectedVehicle={vehicle}
              onSelect={(v) => {
                setVehicle(v);
                setFleetId('');
              }}
              onClear={() => setVehicle(null)}
            />
            <EntitySelect<FleetEntity>
              queryKey={['fleets', 'picker']}
              queryFn={() => listFleets({ pageSize: 100 })}
              getOptionValue={(f) => f.id}
              getOptionLabel={(f) => f.name}
              value={fleetId}
              onChange={(value) => {
                setFleetId(value);
                setVehicle(null);
              }}
              placeholder="Todas as frotas"
              disabled={Boolean(vehicle)}
            />
          </div>
        }
      >
        <></>
      </Block>

      <Block title="Estamos cumprindo os prazos?" description="Pontualidade, volume concluído e ocorrências do período.">
        {hasFilter && scopedSummary.isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Carregando indicadores de prazos">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        )}
        {hasFilter && scopedSummary.isError && (
          <ErrorState title="Não foi possível carregar os indicadores do filtro." onRetry={() => scopedSummary.refetch()} />
        )}
        {(!hasFilter || scopedSummary.data) && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{SUMMARY.map(({ id, icon }) => card(id, icon))}</div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Comparação com o período anterior" description="Viagens e entregas concluídas." />
                <CardBody>
                  <PeriodComparisonChart kpis={volumeKpis} ariaLabel="Viagens e entregas concluídas: período atual e anterior" />
                </CardBody>
              </Card>
              <OnTimePanel kpi={activeKpis.get('on_time_delivery_rate')} onExplain={onExplain} />
            </div>
          </>
        )}
      </Block>

      <Block
        title="Como isso evoluiu?"
        description="Cada ponto usa o mesmo cálculo do resumo acima, aplicado ao intervalo."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={showPrevious}
                onChange={(e) => setShowPrevious(e.target.checked)}
                className="h-4 w-4 rounded border-border-strong text-brand-600 focus:ring-brand-500"
              />
              Comparar com o período anterior
            </label>
            <GranularityControl value={effectiveGranularity} range={range} onChange={onGranularityChange} />
          </div>
        }
      >
        {series.isLoading && (
          <div aria-busy="true" aria-label="Carregando evolução dos prazos">
            <Skeleton className="h-72 w-full" />
          </div>
        )}
        {series.isError && <ErrorState title="Não foi possível carregar a evolução." onRetry={() => series.refetch()} />}
        {seriesData && pointCount < 2 && (
          <EmptyState title="Período curto demais para mostrar evolução" description="Escolha 7 dias ou mais, ou agrupe por um intervalo menor." />
        )}
        {seriesData && pointCount >= 2 && (
          <>
            {showPrevious && <TrendLegend />}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {onTimeSeries && (
                <Card>
                  <CardHeader title="Pontualidade ao longo do período" description="Percentual de entregas no prazo, por intervalo." />
                  <CardBody>
                    <TrendLineChart rows={toSeriesRows(onTimeSeries, effectiveGranularity)} unit="PERCENT" name={onTimeSeries.name} showPrevious={showPrevious} />
                  </CardBody>
                </Card>
              )}
              {occurrencesSeries && (
                <Card>
                  <CardHeader title="Ocorrências" description="Total e críticas, por intervalo." />
                  <CardBody className="flex flex-col gap-3">
                    <TrendLineChart rows={toSeriesRows(occurrencesSeries, effectiveGranularity)} unit="COUNT" name={occurrencesSeries.name} showPrevious={showPrevious} />
                    {criticalSeries && (
                      <TrendLineChart rows={toSeriesRows(criticalSeries, effectiveGranularity)} unit="COUNT" name={criticalSeries.name} showPrevious={showPrevious} />
                    )}
                  </CardBody>
                </Card>
              )}
            </div>
            {seriesData.series.some((s) => s.points.some((p) => p.partial)) && (
              <p className="text-xs text-ink-subtle">
                Intervalos marcados como incompletos começaram antes do período ou ainda estão em andamento.
              </p>
            )}
          </>
        )}
      </Block>

      <Block
        title="Onde estão os desvios?"
        description="Entregas, pontualidade e ocorrências por veículo. Ordene ou busque para investigar — não é um ranking."
      >
        {vehicle ? (
          <EmptyState
            title="Filtro já restrito a 1 veículo"
            description="Limpe o filtro de veículo acima para comparar todos os veículos da frota."
          />
        ) : (
          <DeadlineVehicleTable range={range} fleetId={fleetId || null} />
        )}
      </Block>

      <Block
        title="Onde devo investigar?"
        description="Distância, custo e receita do mesmo período, para continuar a investigação nas abas Frota, Custos e Financeiro."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{CONTEXT.map(({ id, icon }) => card(id, icon))}</div>
      </Block>
    </div>
  );
}
