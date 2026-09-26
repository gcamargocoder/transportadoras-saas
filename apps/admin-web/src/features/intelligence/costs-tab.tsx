'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleDollarSign, Disc, Fuel, Gauge, Milestone, Percent, Receipt, Ticket, Wallet, Wrench } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { EntitySelect } from '../../components/ui/entity-select';
import { ErrorState } from '../../components/ui/error-state';
import { Skeleton } from '../../components/ui/skeleton';
import { getKpiSeries, getKpiSummary } from '../../lib/api/bi.api';
import { listFleets } from '../../lib/api/fleet.api';
import type { FleetEntity, KpiGranularity, KpiResultEntity, VehicleEntity } from '../../types/entities';
import { CostVehicleTable } from './cost-vehicle-table';
import {
  COST_CATEGORIES,
  CostCompositionChart,
  CostCompositionList,
  TrendLegend,
  TrendLineChart,
} from './financial-charts';
import { FleetVehiclePicker } from './fleet-vehicle-picker';
import { KpiCard } from './kpi-card';
import { indexKpis } from './kpi-format';
import type { PeriodRange } from './period';
import { GRANULARITY_LABELS, isGranularityAllowed, toSeriesRows, toStackedRows } from './series-format';

// BI 5 -- resumo focado em CUSTO (operating_cost em vez do trio receita/
// resultado/margem, que ja pertence a aba Financeiro).
const SUMMARY = [
  { id: 'operating_cost', icon: Receipt },
  { id: 'cost_per_km', icon: Gauge },
  { id: 'fuel_cost', icon: Fuel },
  { id: 'maintenance_cost', icon: Wrench },
  { id: 'toll_cost', icon: Ticket },
  { id: 'tire_cost', icon: Disc },
  { id: 'other_cost', icon: Receipt },
];

// Contexto (secao 5 -- "Relacao custo x operacao"): KPIs que ja existem no
// MESMO summary, so reorganizados aqui para contextualizar custo -- nunca uma
// segunda formula financeira (isso e a aba Financeiro).
const CONTEXT = [
  { id: 'distance_km', icon: Milestone },
  { id: 'revenue', icon: CircleDollarSign },
  { id: 'operating_result', icon: Wallet },
  { id: 'operating_margin', icon: Percent },
];

const SERIES_KPIS = ['operating_cost', ...COST_CATEGORIES.map((c) => c.id)];

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

// BI 5 -- aba Custos. Filtro local (mesmo padrao da aba Frota, BI 4): sem
// selecao, reaproveita o summary global da pagina; com selecao, dispara UM
// summary adicional escopado por veiculo/frota -- nunca uma segunda formula
// de custo, so o mesmo GET /bi/kpis/summary com vehicleId/fleetId a mais.
export function CostsTab({
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
    queryKey: ['bi', 'kpis', 'summary', 'costs-scope', range, vehicle?.id, fleetId],
    queryFn: ({ signal }) =>
      getKpiSummary(
        { ...range, kpis: [...SUMMARY, ...CONTEXT].map((s) => s.id).join(','), vehicleId: vehicle?.id, fleetId: fleetId || undefined },
        signal,
      ),
    enabled: hasFilter,
    staleTime: 60_000,
  });
  const activeKpis = hasFilter ? indexKpis(scopedSummary.data?.kpis) : kpis;

  const series = useQuery({
    queryKey: ['bi', 'kpis', 'series', 'costs', range, requestedGranularity ?? 'auto', vehicle?.id, fleetId],
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
  const costSeries = COST_CATEGORIES.map((c) => byId.get(c.id)).filter((s): s is NonNullable<typeof s> => s !== undefined);
  const operatingCostSeries = byId.get('operating_cost');

  const card = (id: string, icon: (typeof SUMMARY)[number]['icon']) => {
    const kpi = activeKpis.get(id);
    return kpi ? <KpiCard key={id} kpi={kpi} icon={icon} onExplain={onExplain} /> : null;
  };

  return (
    <div className="flex flex-col gap-10">
      <Block
        title="Filtro de custos"
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

      <Block title="Resumo de custos" description="Custo operacional realizado no período: onde o dinheiro está sendo gasto.">
        {hasFilter && scopedSummary.isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Carregando indicadores de custo">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        )}
        {hasFilter && scopedSummary.isError && (
          <ErrorState title="Não foi possível carregar os indicadores do filtro." onRetry={() => scopedSummary.refetch()} />
        )}
        {(!hasFilter || scopedSummary.data) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{SUMMARY.map(({ id, icon }) => card(id, icon))}</div>
        )}
      </Block>

      <Block
        title="Evolução dos custos"
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
          <div aria-busy="true" aria-label="Carregando evolução dos custos">
            <Skeleton className="h-72 w-full" />
          </div>
        )}
        {series.isError && <ErrorState title="Não foi possível carregar a evolução." onRetry={() => series.refetch()} />}
        {seriesData && pointCount < 2 && (
          <EmptyState title="Período curto demais para mostrar evolução" description="Escolha 7 dias ou mais, ou agrupe por um intervalo menor." />
        )}
        {seriesData && pointCount >= 2 && operatingCostSeries && (
          <>
            {showPrevious && <TrendLegend />}
            <Card>
              <CardHeader title="Custo operacional total" />
              <CardBody>
                <TrendLineChart
                  rows={toSeriesRows(operatingCostSeries, effectiveGranularity)}
                  unit={operatingCostSeries.unit}
                  name={operatingCostSeries.name}
                  showPrevious={showPrevious}
                />
              </CardBody>
            </Card>
            {seriesData.series.some((s) => s.points.some((p) => p.partial)) && (
              <p className="text-xs text-ink-subtle">
                Intervalos marcados como incompletos começaram antes do período ou ainda estão em andamento.
              </p>
            )}
          </>
        )}
      </Block>

      <Block
        title="Composição dos custos"
        description="Participação de cada categoria de CUSTO OPERACIONAL no período -- não é uma classificação contábil."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader title="Por intervalo" />
            <CardBody>
              {seriesData && pointCount >= 2 ? (
                <CostCompositionChart rows={toStackedRows(costSeries, effectiveGranularity)} categories={COST_CATEGORIES} />
              ) : series.isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <p className="text-sm text-ink-muted">Escolha um período maior para ver a composição ao longo do tempo.</p>
              )}
            </CardBody>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="No período" />
            <CardBody>
              <CostCompositionList kpi={activeKpis.get('operating_cost')} />
            </CardBody>
          </Card>
        </div>
      </Block>

      <Block
        title="Desempenho por veículo"
        description="Custo por veículo em cada categoria, mais custo/km. Ordene ou busque para investigar — não é um ranking."
      >
        {vehicle ? (
          <EmptyState
            title="Filtro já restrito a 1 veículo"
            description="Limpe o filtro de veículo acima para comparar todos os veículos da frota."
          />
        ) : (
          <CostVehicleTable range={range} fleetId={fleetId || null} />
        )}
      </Block>

      <Block
        title="Relação custo × operação"
        description="Distância, receita e resultado do mesmo período, para contextualizar o custo -- os cálculos completos ficam nas abas Frota e Financeiro."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {CONTEXT.map(({ id, icon }) => card(id, icon))}
        </div>
      </Block>
    </div>
  );
}
