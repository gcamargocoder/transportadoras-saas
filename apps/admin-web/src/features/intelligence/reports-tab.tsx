'use client';

import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { EntitySelect } from '../../components/ui/entity-select';
import { ErrorState } from '../../components/ui/error-state';
import { Skeleton } from '../../components/ui/skeleton';
import { getKpiBreakdown, getKpiSeries, getKpiSummary } from '../../lib/api/bi.api';
import { listFleets } from '../../lib/api/fleet.api';
import type { FleetEntity, KpiComparisonMode, KpiGranularity, KpiResultEntity, VehicleEntity } from '../../types/entities';
import { ComparisonModePicker, resolveCompareRange } from './comparison-mode-picker';
import { CostCompositionList, TrendLineChart } from './financial-charts';
import { FleetVehiclePicker } from './fleet-vehicle-picker';
import { KPI_DRILL_DOWN } from './intelligence-config';
import { KpiCard, KpiTrend } from './kpi-card';
import { formatKpiValue, indexKpis } from './kpi-format';
import { OnTimePanel } from './on-time-panel';
import { formatPeriodLabel, type PeriodRange } from './period';
import { RankedValueList, sortRankedItems } from './ranked-value-list';
import { buildInsights, type KpiInsight } from './report-insights';
import { GRANULARITY_LABELS, isGranularityAllowed, toSeriesRows } from './series-format';

const EXECUTIVE_IDS = [
  'revenue',
  'operating_cost',
  'operating_result',
  'operating_margin',
  'trips_completed',
  'deliveries_completed',
  'on_time_delivery_rate',
  'occurrences_total',
  'fleet_utilization',
];
const OPERATION_IDS = ['trips_completed', 'deliveries_completed', 'on_time_delivery_rate', 'fleet_utilization', 'fleet_availability', 'idle_hours', 'occurrences_total'];
const FINANCIAL_IDS = ['revenue', 'operating_cost', 'operating_result', 'operating_margin', 'cost_per_km'];
const FLEET_IDS = ['fleet_utilization', 'fleet_availability', 'idle_hours', 'distance_km', 'cost_per_km'];
const DEADLINES_IDS = ['on_time_delivery_rate', 'occurrences_total', 'occurrences_critical'];
const ALL_IDS = Array.from(new Set([...EXECUTIVE_IDS, ...OPERATION_IDS, ...FINANCIAL_IDS, ...FLEET_IDS, ...DEADLINES_IDS]));
const EVOLUTION_KPIS = ['operating_cost', 'occurrences_total'];

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

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }): JSX.Element {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-8 first:border-t-0 first:pt-0">
      <div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

function StatRow({ kpi }: { kpi: KpiResultEntity | undefined }): JSX.Element | null {
  if (!kpi) return null;
  const unavailable = kpi.status === 'UNAVAILABLE' || kpi.value === null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 text-sm last:border-b-0">
      <span className="text-ink-muted">{kpi.name}</span>
      <div className="flex items-center gap-3">
        <span className="font-semibold tabular-nums text-ink">{unavailable ? '—' : formatKpiValue(kpi.unit, kpi.value as number)}</span>
        <KpiTrend kpi={kpi} />
      </div>
    </div>
  );
}

const TONE_DOT: Record<KpiInsight['tone'], string> = {
  positive: 'bg-success-500',
  negative: 'bg-danger-500',
  neutral: 'bg-info-500',
  unavailable: 'bg-ink-subtle',
};

function InsightList({ insights, onSelect }: { insights: KpiInsight[]; kpis: Map<string, KpiResultEntity>; onSelect: (kpiId: string) => void }): JSX.Element {
  if (insights.length === 0) {
    return <EmptyState title="Sem base de comparação suficiente" description="Nenhum indicador principal tem período anterior válido para comparar." />;
  }
  return (
    <ul className="flex flex-col gap-3">
      {insights.map((insight) => (
        <li key={insight.kpiId}>
          <button type="button" onClick={() => onSelect(insight.kpiId)} className="group flex w-full items-start gap-2.5 text-left text-sm">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[insight.tone]}`} aria-hidden />
            <span className="text-ink group-hover:underline">{insight.text}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function EvidenceRow({ kpi, onExplain }: { kpi: KpiResultEntity | undefined; onExplain: (kpi: KpiResultEntity) => void }): JSX.Element | null {
  if (!kpi) return null;
  const drill = KPI_DRILL_DOWN[kpi.id];
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2.5 text-sm last:border-b-0">
      <span className="text-ink">{kpi.name}</span>
      <div className="flex items-center gap-4 text-xs">
        <button type="button" onClick={() => onExplain(kpi)} className="font-medium text-violet-700 hover:text-violet-900">
          Como é calculado
        </button>
        {drill && (
          <Link href={drill.href} className="font-medium text-brand-700 hover:text-brand-900">
            {drill.label}
          </Link>
        )}
      </div>
    </li>
  );
}

// BI 9 -- Relatorios Inteligentes. Nenhum KPI/formula/comparacao novos:
// organiza os dados oficiais (summary/series/breakdown ja usados nos BI 1-8)
// numa leitura editorial, com o motor de interpretacao (report-insights.ts)
// traduzindo comparison/direction ja calculados em frases -- nunca o
// contrario.
export function ReportsTab({
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
  const requestedGranularity = granularity && isGranularityAllowed(granularity, range.startDate, range.endDate) ? granularity : undefined;

  const compareRange = resolveCompareRange(comparisonMode, compareFrom, compareTo);
  const customIncomplete = comparisonMode === 'CUSTOM' && compareRange === null;
  const hasVehicleFilter = Boolean(vehicle || fleetId);
  const hasCustomScope = comparisonMode !== 'PREVIOUS_PERIOD' || hasVehicleFilter;
  const scope = { vehicleId: vehicle?.id, fleetId: fleetId || undefined };

  const summary = useQuery({
    queryKey: ['bi', 'kpis', 'summary', 'report', range, comparisonMode, compareRange, vehicle?.id, fleetId],
    queryFn: ({ signal }) =>
      getKpiSummary(
        { ...range, kpis: ALL_IDS.join(','), comparison: comparisonMode, compareStartDate: compareRange?.startDate, compareEndDate: compareRange?.endDate, ...scope },
        signal,
      ),
    enabled: hasCustomScope && !customIncomplete,
    staleTime: 60_000,
  });
  const activeKpis = hasCustomScope ? indexKpis(summary.data?.kpis) : kpis;
  const isLoading = hasCustomScope && summary.isLoading;
  const isError = hasCustomScope && summary.isError;

  const seriesComparison = comparisonMode === 'CUSTOM' ? 'NONE' : comparisonMode;
  const series = useQuery({
    queryKey: ['bi', 'kpis', 'series', 'report', range, requestedGranularity ?? 'auto', seriesComparison, vehicle?.id, fleetId],
    queryFn: ({ signal }) => getKpiSeries({ ...range, kpis: EVOLUTION_KPIS.join(','), granularity: requestedGranularity, comparison: seriesComparison, ...scope }, signal),
    enabled: !isLoading && !isError,
    staleTime: 60_000,
  });
  const seriesById = new Map((series.data?.series ?? []).map((s) => [s.id, s]));
  const seriesGranularity = series.data?.granularity ?? requestedGranularity ?? 'day';

  const fleetBreakdown = useQuery({
    queryKey: ['bi', 'kpis', 'breakdown', 'report-fleet', range, vehicle?.id, fleetId],
    queryFn: ({ signal }) => getKpiBreakdown({ ...range, kpiId: 'cost_per_km', dimension: 'vehicle', limit: 3, ...scope }, signal),
    enabled: !isLoading && !isError,
    staleTime: 60_000,
  });
  const occurrenceBreakdown = useQuery({
    queryKey: ['bi', 'kpis', 'breakdown', 'report-occurrences', range, vehicle?.id, fleetId],
    queryFn: ({ signal }) => getKpiBreakdown({ ...range, kpiId: 'occurrences_total', dimension: 'type', limit: 3, ...scope }, signal),
    enabled: !isLoading && !isError,
    staleTime: 60_000,
  });

  const insights = buildInsights(EXECUTIVE_IDS, activeKpis);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold text-ink">Relatório gerencial</h1>
          <p className="mt-1 text-sm text-ink-muted">{formatPeriodLabel(range.startDate, range.endDate)}</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-white px-3 py-1.5 text-sm font-medium text-ink hover:border-brand-300 hover:text-brand-700"
        >
          <Printer size={14} aria-hidden />
          Imprimir
        </button>
      </div>

      <Section title="Base do relatório" description="Escolha com o que comparar o período e, opcionalmente, restrinja a um veículo ou frota.">
        <div className="flex flex-col gap-3 print:hidden">
          <ComparisonModePicker
            mode={comparisonMode}
            onModeChange={setComparisonMode}
            compareFrom={compareFrom}
            compareTo={compareTo}
            onCompareFromChange={setCompareFrom}
            onCompareToChange={setCompareTo}
          />
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted">Evolução (custo e ocorrências) agrupada por:</span>
            <GranularityControl value={seriesGranularity} range={range} onChange={onGranularityChange} />
          </div>
        </div>
      </Section>

      {customIncomplete && (
        <EmptyState title="Escolha o período de referência" description="Informe a data inicial e a final da comparação personalizada." />
      )}

      {!customIncomplete && isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Carregando relatório">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      )}

      {!customIncomplete && isError && <ErrorState title="Não foi possível carregar o relatório." onRetry={() => summary.refetch()} />}

      {!customIncomplete && !isLoading && !isError && (
        <>
          <Section title="Resumo executivo" description="Principais indicadores oficiais do período, com variação em relação à comparação escolhida.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {EXECUTIVE_IDS.map((id) => {
                const kpi = activeKpis.get(id);
                return kpi ? <KpiCard key={id} kpi={kpi} onExplain={onExplain} /> : null;
              })}
            </div>
          </Section>

          <Section title="O que mudou" description="Leitura das comparações oficiais — nunca assume que aumento é sempre positivo ou queda sempre negativa.">
            <InsightList insights={insights} kpis={activeKpis} onSelect={(id) => { const kpi = activeKpis.get(id); if (kpi) onExplain(kpi); }} />
          </Section>

          <Section title="Operação" description="Viagens, entregas, pontualidade, utilização da frota e ocorrências do período.">
            <div>{OPERATION_IDS.map((id) => <StatRow key={id} kpi={activeKpis.get(id)} />)}</div>
          </Section>

          <Section title="Financeiro e custos" description="Receita, custo operacional, resultado, margem e custo por km — indicadores oficiais, sem mistura com contabilidade.">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>{FINANCIAL_IDS.map((id) => <StatRow key={id} kpi={activeKpis.get(id)} />)}</div>
              <Card>
                <CardHeader title="Composição do custo operacional" />
                <CardBody>
                  <CostCompositionList kpi={activeKpis.get('operating_cost')} />
                </CardBody>
              </Card>
            </div>
            {seriesById.get('operating_cost') && (series.data?.series[0]?.points.length ?? 0) >= 2 && (
              <Card>
                <CardHeader title="Evolução do custo operacional" />
                <CardBody>
                  <TrendLineChart rows={toSeriesRows(seriesById.get('operating_cost'), seriesGranularity)} unit="BRL" name="Despesas operacionais" showPrevious={seriesComparison !== 'NONE'} />
                </CardBody>
              </Card>
            )}
          </Section>

          <Section title="Frota" description="Utilização, disponibilidade, ociosidade, distância e custo por km — sem classificar veículos como bons ou ruins.">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>{FLEET_IDS.map((id) => <StatRow key={id} kpi={activeKpis.get(id)} />)}</div>
              <Card>
                <CardHeader title="Custo por km — 3 principais concentrações" description="Ordenado por valor, não é uma classificação de veículo." />
                <CardBody>
                  {fleetBreakdown.isLoading && <Skeleton className="h-32 w-full" />}
                  {fleetBreakdown.isError && <ErrorState title="Não foi possível carregar o recorte por veículo." onRetry={() => fleetBreakdown.refetch()} />}
                  {fleetBreakdown.data && <RankedValueList unit="BRL_PER_KM" items={sortRankedItems(fleetBreakdown.data.items)} />}
                </CardBody>
              </Card>
            </div>
          </Section>

          <Section title="Prazos e ocorrências" description="Pontualidade (com cobertura dos dados), ocorrências totais/críticas e onde estão concentradas.">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <OnTimePanel kpi={activeKpis.get('on_time_delivery_rate')} onExplain={onExplain} />
              <div>{DEADLINES_IDS.map((id) => <StatRow key={id} kpi={activeKpis.get(id)} />)}</div>
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="Ocorrências por tipo — 3 principais" />
                <CardBody>
                  {occurrenceBreakdown.isLoading && <Skeleton className="h-32 w-full" />}
                  {occurrenceBreakdown.isError && <ErrorState title="Não foi possível carregar a distribuição por tipo." onRetry={() => occurrenceBreakdown.refetch()} />}
                  {occurrenceBreakdown.data && <RankedValueList unit="COUNT" items={sortRankedItems(occurrenceBreakdown.data.items)} />}
                </CardBody>
              </Card>
              {seriesById.get('occurrences_total') && (series.data?.series[0]?.points.length ?? 0) >= 2 && (
                <Card>
                  <CardHeader title="Evolução das ocorrências" />
                  <CardBody>
                    <TrendLineChart rows={toSeriesRows(seriesById.get('occurrences_total'), seriesGranularity)} unit="COUNT" name="Ocorrências" showPrevious={seriesComparison !== 'NONE'} />
                  </CardBody>
                </Card>
              )}
            </div>
          </Section>

          <Section title="Evidências" description="Toda leitura acima pode ser rastreada até a fórmula oficial e os registros de origem.">
            <ul>
              {EXECUTIVE_IDS.map((id) => (
                <EvidenceRow key={id} kpi={activeKpis.get(id)} onExplain={onExplain} />
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}
