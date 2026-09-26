'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { DatePicker } from '../../components/ui/date-picker';
import { EmptyState } from '../../components/ui/empty-state';
import { EntitySelect } from '../../components/ui/entity-select';
import { ErrorState } from '../../components/ui/error-state';
import { Skeleton } from '../../components/ui/skeleton';
import { getKpiBreakdown, getKpiSeries, getKpiSummary } from '../../lib/api/bi.api';
import { listFleets } from '../../lib/api/fleet.api';
import type { FleetEntity, KpiCategory, KpiComparisonMode, KpiGranularity, KpiResultEntity, KpiUnit, VehicleEntity } from '../../types/entities';
import { cn } from '../../utils/cn';
import { ResultBarChart, TrendLegend, TrendLineChart } from './financial-charts';
import { FleetVehiclePicker } from './fleet-vehicle-picker';
import { KpiCard, TREND_STYLES } from './kpi-card';
import { classifyRawTrend, formatKpiValue, indexKpis, RAW_TREND_LABEL, resolveSeriesTrendTone } from './kpi-format';
import { OVERVIEW_KPI_IDS } from './overview-tab';
import { resolvePeriodRange, type PeriodRange } from './period';
import { GRANULARITY_LABELS, isGranularityAllowed, toSeriesRows, type SeriesRow } from './series-format';

const COMPARISON_MODES: { value: KpiComparisonMode; label: string }[] = [
  { value: 'PREVIOUS_PERIOD', label: 'Período anterior' },
  { value: 'PREVIOUS_YEAR', label: 'Mesmo período do ano passado' },
  { value: 'CUSTOM', label: 'Personalizado' },
];

const CATEGORY_LABELS: Record<KpiCategory, string> = {
  FINANCIAL: 'Financeiro',
  OPERATIONAL: 'Operacional',
  FLEET: 'Frota',
  SERVICE_LEVEL: 'Nível de serviço',
};
const CATEGORY_ORDER: KpiCategory[] = ['FINANCIAL', 'OPERATIONAL', 'FLEET', 'SERVICE_LEVEL'];

// BI 7 -- mesmos indicadores oficiais da Visao geral (evita 2 curadorias
// divergentes de "principais KPIs"): agora comparaveis em qualquer modo.
const HEADLINE_KPI_IDS = OVERVIEW_KPI_IDS;

// Series com evolucao + tendencia. Todos ja aparecem no resumo acima --
// nenhum dado novo, so outra visualizacao dos mesmos KPIs oficiais.
const EVOLUTION_KPIS = ['revenue', 'operating_result', 'cost_per_km', 'on_time_delivery_rate'];

// KPIs oficiais que ja suportam breakdown?dimension=vehicle (ver
// bi-kpis.service.ts): unico criterio para entrar aqui.
const DIMENSION_OPTIONS: { id: string; label: string; unit: KpiUnit }[] = [
  { id: 'cost_per_km', label: 'Custo por km', unit: 'BRL_PER_KM' },
  { id: 'on_time_delivery_rate', label: 'Entregas no prazo', unit: 'PERCENT' },
  { id: 'trips_completed', label: 'Viagens concluídas', unit: 'COUNT' },
  { id: 'occurrences_total', label: 'Ocorrências', unit: 'COUNT' },
];

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

function TrendBadge({ direction, rows }: { direction: KpiResultEntity['direction']; rows: SeriesRow[] }): JSX.Element | null {
  const values = rows.map((r) => r.current).filter((v): v is number => v !== null);
  if (values.length < 2) return null;
  const raw = classifyRawTrend(values[0] as number, values[values.length - 1] as number);
  const tone = resolveSeriesTrendTone(direction, raw);
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', TREND_STYLES[tone])}>
      Tendência: {RAW_TREND_LABEL[raw]}
    </span>
  );
}

// BI 7 -- ranking compacto de 1 KPI por veiculo (nao substitui as tabelas
// investigativas de Frota/Custos/Prazos, que trazem varias metricas por
// linha). Ordena por valor -- aceitavel (mesmo padrao ja usado nas tabelas
// por veiculo): o que NAO se faz e rotular "melhor"/"pior" veiculo.
function DimensionRankingList({ unit, items }: { unit: KpiUnit; items: { key: string | null; label: string; value: number | null; unavailableReason: string | null }[] }): JSX.Element {
  if (items.length === 0) return <EmptyState title="Nenhum veículo no escopo selecionado" />;
  const max = Math.max(0, ...items.map((i) => Math.abs(i.value ?? 0)));
  return (
    <ul className="flex flex-col gap-3">
      {items.map((it) => (
        <li key={it.key ?? it.label}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink">{it.label}</span>
            <span className={cn('tabular-nums', it.value === null ? 'text-ink-subtle' : 'text-ink')} title={it.unavailableReason ?? undefined}>
              {it.value === null ? '—' : formatKpiValue(unit, it.value)}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${max > 0 ? (Math.abs(it.value ?? 0) / max) * 100 : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// BI 7 -- Comparativos e Tendencias. Nenhum KPI/formula novo: generaliza a
// comparacao ja oficial (summary.comparison, series.comparisonPoints,
// breakdown por veiculo) para varios modos (periodo anterior/ano
// anterior/personalizado) e para os KPIs oficiais mais representativos de
// cada dominio, num unico lugar.
export function ComparativesTab({
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
  const [comparisonMode, setComparisonMode] = useState<KpiComparisonMode>('PREVIOUS_PERIOD');
  const [compareFrom, setCompareFrom] = useState('');
  const [compareTo, setCompareTo] = useState('');
  const [vehicle, setVehicle] = useState<VehicleEntity | null>(null);
  const [fleetId, setFleetId] = useState('');
  const [dimensionKpiId, setDimensionKpiId] = useState(DIMENSION_OPTIONS[0]!.id);
  const requestedGranularity = granularity && isGranularityAllowed(granularity, range.startDate, range.endDate) ? granularity : undefined;

  const compareRange = comparisonMode === 'CUSTOM' ? resolvePeriodRange('custom', new Date(), { from: compareFrom, to: compareTo }) : null;
  const invalidCompareRange = comparisonMode === 'CUSTOM' && compareFrom !== '' && compareTo !== '' && compareFrom > compareTo;
  const customIncomplete = comparisonMode === 'CUSTOM' && compareRange === null;
  const hasVehicleFilter = Boolean(vehicle || fleetId);
  const hasCustomScope = comparisonMode !== 'PREVIOUS_PERIOD' || hasVehicleFilter;

  const summary = useQuery({
    queryKey: ['bi', 'kpis', 'summary', 'comparatives', range, comparisonMode, compareRange, vehicle?.id, fleetId],
    queryFn: ({ signal }) =>
      getKpiSummary(
        {
          ...range,
          kpis: HEADLINE_KPI_IDS.join(','),
          comparison: comparisonMode,
          compareStartDate: compareRange?.startDate,
          compareEndDate: compareRange?.endDate,
          vehicleId: vehicle?.id,
          fleetId: fleetId || undefined,
        },
        signal,
      ),
    enabled: hasCustomScope && !customIncomplete,
    staleTime: 60_000,
  });
  const activeKpis = hasCustomScope ? indexKpis(summary.data?.kpis) : kpis;
  const isLoading = hasCustomScope && summary.isLoading;
  const isError = hasCustomScope && summary.isError;

  // Series so alinha buckets contra PREVIOUS_PERIOD/PREVIOUS_YEAR/NONE (o
  // "personalizado" do resumo nao tem par posicional por balde).
  const seriesComparison = comparisonMode === 'CUSTOM' ? 'NONE' : comparisonMode;
  const series = useQuery({
    queryKey: ['bi', 'kpis', 'series', 'comparatives', range, requestedGranularity ?? 'auto', seriesComparison, vehicle?.id, fleetId],
    queryFn: ({ signal }) =>
      getKpiSeries(
        {
          ...range,
          kpis: EVOLUTION_KPIS.join(','),
          granularity: requestedGranularity,
          comparison: seriesComparison,
          vehicleId: vehicle?.id,
          fleetId: fleetId || undefined,
        },
        signal,
      ),
    staleTime: 60_000,
  });
  const seriesData = series.data;
  const effectiveGranularity = seriesData?.granularity ?? requestedGranularity ?? 'day';
  const byId = new Map((seriesData?.series ?? []).map((s) => [s.id, s]));
  const pointCount = seriesData?.series[0]?.points.length ?? 0;

  const dimensionOption = DIMENSION_OPTIONS.find((d) => d.id === dimensionKpiId) ?? DIMENSION_OPTIONS[0]!;
  const dimensionBreakdown = useQuery({
    queryKey: ['bi', 'kpis', 'breakdown', 'comparatives', dimensionKpiId, range, vehicle?.id, fleetId],
    queryFn: ({ signal }) =>
      getKpiBreakdown({ ...range, kpiId: dimensionKpiId, dimension: 'vehicle', limit: 8, vehicleId: vehicle?.id, fleetId: fleetId || undefined }, signal),
    staleTime: 60_000,
  });
  const rankedItems = [...(dimensionBreakdown.data?.items ?? [])].sort((a, b) => {
    if (a.value === null && b.value === null) return 0;
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return b.value - a.value;
  });

  const categories = new Map<KpiCategory, KpiResultEntity[]>();
  for (const id of HEADLINE_KPI_IDS) {
    const kpi = activeKpis.get(id);
    if (!kpi) continue;
    const list = categories.get(kpi.category) ?? [];
    list.push(kpi);
    categories.set(kpi.category, list);
  }

  return (
    <div className="flex flex-col gap-10">
      <Block
        title="Base de comparação"
        description="Escolha com o que comparar o período atual e, opcionalmente, restrinja a um veículo ou frota."
      >
        <div className="flex flex-col gap-3">
          <div role="radiogroup" aria-label="Comparar com" className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-muted p-0.5">
            {COMPARISON_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                role="radio"
                aria-checked={comparisonMode === mode.value}
                onClick={() => setComparisonMode(mode.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500',
                  comparisonMode === mode.value ? 'bg-white text-ink shadow-xs' : 'text-ink-muted hover:text-ink',
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {comparisonMode === 'CUSTOM' && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="comparatives-compare-from">
                Data inicial de referência
              </label>
              <DatePicker id="comparatives-compare-from" value={compareFrom} max={compareTo || undefined} onChange={(e) => setCompareFrom(e.target.value)} />
              <span className="text-xs text-ink-muted">até</span>
              <label className="sr-only" htmlFor="comparatives-compare-to">
                Data final de referência
              </label>
              <DatePicker id="comparatives-compare-to" value={compareTo} min={compareFrom || undefined} onChange={(e) => setCompareTo(e.target.value)} />
              {invalidCompareRange && (
                <p role="alert" className="w-full text-xs text-danger-700">
                  A data inicial precisa ser anterior à final.
                </p>
              )}
            </div>
          )}

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
        </div>
      </Block>

      <Block title="Resumo comparativo" description="Indicadores oficiais mais representativos de cada área, no modo de comparação escolhido.">
        {customIncomplete && (
          <EmptyState title="Escolha o período de referência" description="Informe a data inicial e a final da comparação personalizada." />
        )}
        {!customIncomplete && isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Carregando indicadores comparativos">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        )}
        {!customIncomplete && isError && (
          <ErrorState title="Não foi possível carregar os indicadores." onRetry={() => summary.refetch()} />
        )}
        {!customIncomplete && !isLoading && !isError && (
          <div className="flex flex-col gap-6">
            {CATEGORY_ORDER.filter((c) => categories.has(c)).map((category) => (
              <div key={category}>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{CATEGORY_LABELS[category]}</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {categories.get(category)!.map((kpi) => (
                    <KpiCard key={kpi.id} kpi={kpi} onExplain={onExplain} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Block>

      <Block
        title="Evolução e tendência"
        description="Cada gráfico usa o mesmo cálculo oficial do KPI, balde a balde."
        action={<GranularityControl value={effectiveGranularity} range={range} onChange={onGranularityChange} />}
      >
        {comparisonMode === 'CUSTOM' && (
          <p className="text-xs text-ink-subtle">Comparação personalizada não se aplica à evolução por intervalo — mostrando sem comparação.</p>
        )}
        {series.isLoading && (
          <div aria-busy="true" aria-label="Carregando evolução comparativa">
            <Skeleton className="h-72 w-full" />
          </div>
        )}
        {series.isError && <ErrorState title="Não foi possível carregar a evolução." onRetry={() => series.refetch()} />}
        {seriesData && pointCount < 2 && (
          <EmptyState title="Período curto demais para mostrar evolução" description="Escolha 7 dias ou mais, ou agrupe por um intervalo menor." />
        )}
        {seriesData && pointCount >= 2 && (
          <>
            {seriesComparison !== 'NONE' && <TrendLegend />}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {EVOLUTION_KPIS.map((id) => {
                const s = byId.get(id);
                if (!s) return null;
                const rows = toSeriesRows(s, effectiveGranularity);
                return (
                  <Card key={id}>
                    <CardHeader title={s.name} action={<TrendBadge direction={s.direction} rows={rows} />} />
                    <CardBody>
                      {id === 'operating_result' ? <ResultBarChart rows={rows} /> : <TrendLineChart rows={rows} unit={s.unit} name={s.name} showPrevious={seriesComparison !== 'NONE'} />}
                    </CardBody>
                  </Card>
                );
              })}
            </div>
            {seriesData.series.some((s) => s.points.some((p) => p.partial)) && (
              <p className="text-xs text-ink-subtle">Intervalos marcados como incompletos começaram antes do período ou ainda estão em andamento.</p>
            )}
          </>
        )}
      </Block>

      <Block
        title="Por dimensão"
        description="Mesma comparação, recortada por veículo — reaproveita o recorte oficial já usado nas outras abas."
        action={
          <div role="radiogroup" aria-label="Indicador por veículo" className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-muted p-0.5">
            {DIMENSION_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={dimensionKpiId === option.id}
                onClick={() => setDimensionKpiId(option.id)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500',
                  dimensionKpiId === option.id ? 'bg-white text-ink shadow-xs' : 'text-ink-muted hover:text-ink',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      >
        <Card>
          <CardBody>
            {dimensionBreakdown.isLoading && <Skeleton className="h-40 w-full" />}
            {dimensionBreakdown.isError && <ErrorState title="Não foi possível carregar o recorte por veículo." onRetry={() => dimensionBreakdown.refetch()} />}
            {dimensionBreakdown.data && <DimensionRankingList unit={dimensionOption.unit} items={rankedItems} />}
          </CardBody>
        </Card>
      </Block>
    </div>
  );
}
