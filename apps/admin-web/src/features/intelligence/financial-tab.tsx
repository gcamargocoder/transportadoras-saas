'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CircleDollarSign,
  Gauge,
  Percent,
  Receipt,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { ErrorState } from '../../components/ui/error-state';
import { Skeleton } from '../../components/ui/skeleton';
import { getKpiBreakdown, getKpiSeries } from '../../lib/api/bi.api';
import type { KpiGranularity, KpiResultEntity, KpiSeriesEntity } from '../../types/entities';
import { cn } from '../../utils/cn';
import { formatNumber } from '../../utils/format';
import {
  COST_CATEGORY_COLORS,
  CostCompositionChart,
  CURRENT_COLOR,
  PREVIOUS_COLOR,
  ResultBarChart,
  TrendLineChart,
  type CostCategory,
} from './financial-charts';
import { KpiCard } from './kpi-card';
import { findInput, formatKpiValue } from './kpi-format';
import type { PeriodRange } from './period';
import {
  GRANULARITY_LABELS,
  isGranularityAllowed,
  toSeriesRows,
  toStackedRows,
  type SeriesRow,
} from './series-format';

const SUMMARY: Array<{ id: string; icon: LucideIcon }> = [
  { id: 'revenue', icon: CircleDollarSign },
  { id: 'operating_cost', icon: Receipt },
  { id: 'operating_result', icon: Wallet },
  { id: 'operating_margin', icon: Percent },
  { id: 'cost_per_km', icon: Gauge },
  { id: 'revenue_per_km', icon: TrendingUp },
];

// Mesmas categorias (e mesma ordem) dos componentes de operating_cost.
const COST_CATEGORIES: CostCategory[] = [
  { id: 'fuel_cost', label: 'Combustível' },
  { id: 'maintenance_cost', label: 'Manutenção' },
  { id: 'tire_cost', label: 'Pneus' },
  { id: 'toll_cost', label: 'Pedágios' },
  { id: 'other_cost', label: 'Outras despesas' },
];
const COST_INPUT_KEYS: Record<string, string> = {
  fuel_cost: 'fuelCost',
  maintenance_cost: 'maintenanceCost',
  tire_cost: 'tireCost',
  toll_cost: 'tollCost',
  other_cost: 'otherCost',
};

const TREND_KPIS = ['revenue', 'operating_cost', 'operating_result', 'operating_margin'];
// Uma unica chamada de serie para toda a aba: tendencias + composicao.
const SERIES_KPIS = [...TREND_KPIS, ...COST_CATEGORIES.map((c) => c.id)];

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
            className={cn(
              'rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-40',
              value === option ? 'bg-white text-ink shadow-xs' : 'text-ink-muted hover:text-ink',
            )}
          >
            {GRANULARITY_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}

function ChartCard({ title, description, children }: { title: string; description?: string; children: ReactNode }): JSX.Element {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function TrendLegend(): JSX.Element {
  return (
    <p className="flex flex-wrap items-center gap-4 text-xs text-ink-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded" style={{ backgroundColor: CURRENT_COLOR }} aria-hidden />
        Período atual
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: PREVIOUS_COLOR }} aria-hidden />
        Período anterior
      </span>
    </p>
  );
}

function SeriesTable({ series, rowsById }: { series: KpiSeriesEntity[]; rowsById: Map<string, SeriesRow[]> }): JSX.Element {
  const first = rowsById.get(series[0]?.id ?? '') ?? [];
  return (
    <details className="rounded-lg border border-border bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink">Ver dados em tabela</summary>
      <div className="scrollbar-thin overflow-x-auto border-t border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-subtle text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">
                Período
              </th>
              {series.map((s) => (
                <th key={s.id} scope="col" className="px-4 py-2 text-right font-medium">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {first.map((row, index) => (
              <tr key={row.bucket} className="border-t border-border">
                <th scope="row" className="px-4 py-2 font-medium text-ink">
                  {row.label}
                  {row.partial && <span className="ml-1 font-normal text-warning-700">(incompleto)</span>}
                </th>
                {series.map((s) => (
                  <td key={s.id} className="px-4 py-2 text-right tabular-nums text-ink">
                    {formatKpiValue(s.unit, rowsById.get(s.id)?.[index]?.current ?? null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function CostCompositionList({ kpi }: { kpi: KpiResultEntity | undefined }): JSX.Element | null {
  const total = findInput(kpi, 'totalCost');
  if (total === null) return null;
  return (
    <ul className="flex flex-col gap-3 text-sm">
      {COST_CATEGORIES.map((category) => {
        const value = findInput(kpi, COST_INPUT_KEYS[category.id] ?? '') ?? 0;
        const share = total > 0 ? (value / total) * 100 : null;
        return (
          <li key={category.id}>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-ink">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COST_CATEGORY_COLORS[category.id] }} aria-hidden />
                {category.label}
              </span>
              <span className="tabular-nums text-ink">
                {formatKpiValue('BRL', value)}
                <span className="ml-2 inline-block w-12 text-right text-xs text-ink-muted">
                  {share === null ? '—' : `${formatNumber(share, 1)}%`}
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${share ?? 0}%`, backgroundColor: COST_CATEGORY_COLORS[category.id] }}
              />
            </div>
          </li>
        );
      })}
      <li className="flex items-center justify-between border-t border-border pt-3 font-semibold text-ink">
        <span>Total</span>
        <span className="tabular-nums">{formatKpiValue('BRL', total)}</span>
      </li>
    </ul>
  );
}

function RevenueByCustomer({ range }: { range: PeriodRange }): JSX.Element {
  const breakdown = useQuery({
    queryKey: ['bi', 'kpis', 'breakdown', 'revenue', 'customer', range],
    queryFn: ({ signal }) =>
      getKpiBreakdown({ ...range, kpiId: 'revenue', dimension: 'customer', limit: 5 }, signal),
    staleTime: 60_000,
  });

  if (breakdown.isLoading) return <Skeleton className="h-40 w-full" />;
  if (breakdown.isError) return <ErrorState onRetry={() => breakdown.refetch()} />;
  const data = breakdown.data;
  if (!data || data.total === 0) {
    return <EmptyState title="Sem receita no período" description="Nenhuma receita de viagem registrada no período." />;
  }
  const rows = data.others ? [...data.items, data.others] : data.items;
  const max = Math.max(...rows.map((r) => r.value ?? 0));

  return (
    <ul className="flex flex-col gap-3 text-sm" aria-label="Receita por cliente">
      {rows.map((row) => (
        <li key={row.key ?? row.label}>
          <div className="flex items-center justify-between gap-3">
            {row.key ? (
              <Link href={`/customers/${row.key}`} className="truncate font-medium text-ink hover:text-brand-700">
                {row.label}
              </Link>
            ) : (
              <span className="truncate text-ink-muted">{row.label}</span>
            )}
            <span className="shrink-0 tabular-nums text-ink">
              {formatKpiValue('BRL', row.value)}
              <span className="ml-2 inline-block w-12 text-right text-xs text-ink-muted">
                {row.share === null ? '—' : `${formatNumber(row.share, 1)}%`}
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${max > 0 ? ((row.value ?? 0) / max) * 100 : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// BI 3 -- aba Financeiro. Resumo vem do MESMO summary das outras abas (sem
// nova chamada); evolucao e composicao vem de UMA chamada a /bi/kpis/series
// (9 KPIs, comparacao com o periodo anterior); receita por cliente de
// /bi/kpis/breakdown.
export function FinancialTab({
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
  const [showPrevious, setShowPrevious] = useState(true);
  const requestedGranularity =
    granularity && isGranularityAllowed(granularity, range.startDate, range.endDate) ? granularity : undefined;

  const series = useQuery({
    queryKey: ['bi', 'kpis', 'series', 'financial', range, requestedGranularity ?? 'auto'],
    queryFn: ({ signal }) =>
      getKpiSeries(
        { ...range, kpis: SERIES_KPIS.join(','), granularity: requestedGranularity, comparison: 'PREVIOUS_PERIOD' },
        signal,
      ),
    staleTime: 60_000,
  });

  const data = series.data;
  const effectiveGranularity = data?.granularity ?? requestedGranularity ?? 'day';
  const byId = new Map((data?.series ?? []).map((s) => [s.id, s]));
  const rowsById = new Map((data?.series ?? []).map((s) => [s.id, toSeriesRows(s, effectiveGranularity)]));
  const pointCount = data?.series[0]?.points.length ?? 0;
  const costSeries = COST_CATEGORIES.map((c) => byId.get(c.id)).filter((s): s is KpiSeriesEntity => s !== undefined);
  const trendSeries = TREND_KPIS.map((id) => byId.get(id)).filter((s): s is KpiSeriesEntity => s !== undefined);

  const trend = (id: string) => {
    const s = byId.get(id);
    return s ? <TrendLineChart rows={rowsById.get(id) ?? []} unit={s.unit} name={s.name} showPrevious={showPrevious} /> : null;
  };

  return (
    <div className="flex flex-col gap-10">
      <Block title="Resumo financeiro" description="Receita e custos operacionais realizados no período.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {SUMMARY.map(({ id, icon }) => {
            const kpi = kpis.get(id);
            return kpi ? <KpiCard key={id} kpi={kpi} icon={icon} onExplain={onExplain} /> : null;
          })}
        </div>
      </Block>

      <Block
        title="Evolução financeira"
        description="Cada ponto usa o mesmo cálculo dos indicadores acima, aplicado ao intervalo."
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
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Carregando evolução">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-72 w-full" />
            ))}
          </div>
        )}
        {series.isError && <ErrorState title="Não foi possível carregar a evolução." onRetry={() => series.refetch()} />}
        {data && pointCount < 2 && (
          <EmptyState
            title="Período curto demais para mostrar evolução"
            description="Escolha 7 dias ou mais, ou agrupe por um intervalo menor."
          />
        )}
        {data && pointCount >= 2 && (
          <>
            {showPrevious && <TrendLegend />}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard title="Receita">{trend('revenue')}</ChartCard>
              <ChartCard title="Despesas operacionais">{trend('operating_cost')}</ChartCard>
              <ChartCard title="Resultado operacional" description="Verde: resultado positivo. Vermelho: prejuízo.">
                <ResultBarChart rows={rowsById.get('operating_result') ?? []} />
              </ChartCard>
              <ChartCard title="Margem operacional" description="Intervalos sem receita ficam em branco.">
                {trend('operating_margin')}
              </ChartCard>
            </div>
            {data.series.some((s) => s.points.some((p) => p.partial)) && (
              <p className="text-xs text-ink-subtle">
                Intervalos marcados como incompletos no detalhe começaram antes do período ou ainda estão em andamento.
              </p>
            )}
            <SeriesTable series={trendSeries} rowsById={rowsById} />
          </>
        )}
      </Block>

      <Block
        title="Composição dos custos"
        description="Mesmas categorias do custo operacional. Adiantamentos a motoristas não entram (não são custo)."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader title="Por intervalo" />
            <CardBody>
              {data && pointCount >= 2 ? (
                <CostCompositionChart rows={toStackedRows(costSeries, effectiveGranularity)} categories={COST_CATEGORIES} />
              ) : series.isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <p className="text-sm text-ink-muted">Escolha um período maior para ver a composição ao longo do tempo.</p>
              )}
            </CardBody>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader
              title="No período"
              action={
                kpis.get('operating_cost') ? (
                  <Link
                    href="/operations/fleet/costs"
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900"
                  >
                    Ver custos
                    <ArrowRight size={13} aria-hidden />
                  </Link>
                ) : null
              }
            />
            <CardBody>
              <CostCompositionList kpi={kpis.get('operating_cost')} />
            </CardBody>
          </Card>
        </div>
      </Block>

      <Block title="Receita por cliente" description="Os 5 clientes com maior receita no período; o restante aparece agrupado.">
        <Card>
          <CardBody>
            <RevenueByCustomer range={range} />
          </CardBody>
        </Card>
      </Block>
    </div>
  );
}
