'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Droplets, Fuel, Gauge, Route, Scale, TrendingUp, Wallet } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { EntitySelect } from '../../components/ui/entity-select';
import { ErrorState } from '../../components/ui/error-state';
import { Skeleton } from '../../components/ui/skeleton';
import { getFuelDashboard } from '../../lib/api/fuel.api';
import { getKpiEvidence, getKpiSeries, getKpiSummary } from '../../lib/api/bi.api';
import { listFuelTanks } from '../../lib/api/fuel-tanks.api';
import type { FuelTankEntity, KpiGranularity, KpiResultEntity } from '../../types/entities';
import { formatDate, formatNumber } from '../../utils/format';
import { TrendLineChart } from './financial-charts';
import { FuelTankTable } from './fuel-tank-table';
import { FuelVehicleTable } from './fuel-vehicle-table';
import { InsightList } from './insight-list';
import { KpiCard } from './kpi-card';
import { indexKpis } from './kpi-format';
import type { PeriodRange } from './period';
import { GRANULARITY_LABELS, isGranularityAllowed, toSeriesRows } from './series-format';
import { buildInsights } from './report-insights';

// Fase 6/8 -- ledger do tanque proprio (FuelTankMovement). Fonte SEPARADA de
// fuel_cost/fuel_liters (FuelSupply, consumo do veiculo) usados no Bloco 4.
const STOCK_KPIS = ['fuel_tank_stock'];
const PURCHASE_KPIS = ['fuel_received_liters', 'fuel_received_cost', 'fuel_average_purchase_price'];
const CONSUMPTION_KPIS = ['fuel_internal_liters'];
const CONTROL_KPIS = ['fuel_reconciliation_divergence_liters', 'fuel_adjustment_liters', 'fuel_movements_count'];
const TANK_SCOPED_KPIS = [...STOCK_KPIS, ...PURCHASE_KPIS, ...CONSUMPTION_KPIS, ...CONTROL_KPIS];
const KPI_ICONS: Record<string, typeof Gauge> = {
  fuel_tank_stock: Gauge,
  fuel_received_liters: Droplets,
  fuel_received_cost: Wallet,
  fuel_average_purchase_price: TrendingUp,
  fuel_internal_liters: Fuel,
  fuel_cost: Wallet,
  cost_per_km: Route,
  fuel_reconciliation_divergence_liters: Scale,
  fuel_adjustment_liters: ClipboardList,
};

// Fase 8, "O que mudou" -- so os indicadores que melhor resumem a operacao
// de combustivel (mesmo motor determinístico do BI 9/11, nunca uma segunda
// formula de interpretacao).
const INSIGHT_KPIS = [
  'fuel_tank_stock',
  'fuel_received_liters',
  'fuel_received_cost',
  'fuel_average_purchase_price',
  'fuel_internal_liters',
  'fuel_cost',
  'fuel_reconciliation_divergence_liters',
];
const SERIES_KPIS = [...TANK_SCOPED_KPIS];

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

// Fase 8 -- comparacao interno x externo: SEMPRE a visao global (todos os
// tanques), nunca escopada por tanque -- misturar um total sem filtro de
// tanque (fuel_liters, FuelSupply) com um valor filtrado por tanque
// confundiria o significado da barra. externalLiters e uma SUBTRACAO de
// dois totais OFICIAIS ja calculados pelo backend (fuel_liters -
// fuel_internal_liters), nunca uma segunda formula de KPI -- os dois valores
// batem exatamente porque todo abastecimento interno grava a MESMA
// quantidade de litros em FuelSupply.liters e em FuelTankMovement.
// quantityLiters, na mesma transacao (Fase 3/7).
function OriginSplit({ totalLiters, internalLiters }: { totalLiters: number; internalLiters: number }): JSX.Element {
  const externalLiters = Math.max(0, totalLiters - internalLiters);
  const max = Math.max(totalLiters, 1);
  const rows = [
    { label: 'Interno (tanque próprio)', value: internalLiters, color: 'bg-brand-500' },
    { label: 'Externo (posto/fornecedor)', value: externalLiters, color: 'bg-amber-500' },
  ];
  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink">{row.label}</span>
            <span className="tabular-nums text-ink-muted">
              {formatNumber(row.value)} L{totalLiters > 0 ? ` · ${formatNumber((row.value / totalLiters) * 100, 1)}%` : ''}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted">
            <div className={`h-full rounded-full ${row.color}`} style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
      <p className="text-xs text-ink-subtle">
        Custo do abastecimento interno normalmente não é aplicável: os litros já saíram do estoque próprio, sem uma compra associada a ele (o
        custo foi pago no recebimento do tanque).
      </p>
    </div>
  );
}

// Fase 6 -- Fundacao do BI de Combustivel (Fase 8 -- painel final). Reaproveita
// 100% a infraestrutura do BI 1-11 (mesmo /bi/kpis/summary|series|breakdown|
// evidence ja usado pelas outras abas): nenhuma formula nova alem de uma
// pequena extensao de breakdown (fuel_liters x vehicle, Fase 8). Filtro por
// tanque (mesmo padrao de veiculo/frota da aba Custos): sem selecao, mostra a
// soma de todos os tanques proprios; com selecao, dispara UM summary/serie
// adicionais escopados por tankId -- nunca por card.
export function FuelTab({
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
  const [tank, setTank] = useState<FuelTankEntity | null>(null);
  const hasFilter = Boolean(tank);
  const requestedGranularity = granularity && isGranularityAllowed(granularity, range.startDate, range.endDate) ? granularity : undefined;

  const tanksQuery = useQuery({
    queryKey: ['fuel-tanks', 'picker'],
    queryFn: () => listFuelTanks({ pageSize: 100 }),
    staleTime: 60_000,
  });
  const noTanks = tanksQuery.data !== undefined && tanksQuery.data.items.length === 0;
  const tankCount = tanksQuery.data?.items.length ?? 0;
  const totalCapacity = tanksQuery.data?.items.reduce((sum, t) => sum + t.capacityLiters, 0) ?? null;
  const tanksWithMinStock = tanksQuery.data?.items.filter((t) => t.minStockLiters !== null) ?? [];
  const totalMinStock = tanksWithMinStock.length > 0 ? tanksWithMinStock.reduce((sum, t) => sum + (t.minStockLiters ?? 0), 0) : null;

  // Fase 8 -- todos os KPIs de tanque num UNICO summary escopado (nunca um
  // por bloco/card); sem filtro, reaproveita o summary global da pagina
  // (kpis prop), que ja inclui esses ids (catalogo completo).
  const scopedSummary = useQuery({
    queryKey: ['bi', 'kpis', 'summary', 'fuel-scope', range, tank?.id],
    queryFn: ({ signal }) => getKpiSummary({ ...range, kpis: TANK_SCOPED_KPIS.join(','), tankId: tank?.id }, signal),
    enabled: hasFilter,
    staleTime: 60_000,
  });
  const activeKpis = hasFilter ? indexKpis(scopedSummary.data?.kpis) : kpis;

  const series = useQuery({
    queryKey: ['bi', 'kpis', 'series', 'fuel', range, requestedGranularity ?? 'auto', tank?.id],
    queryFn: ({ signal }) =>
      getKpiSeries({ ...range, kpis: SERIES_KPIS.join(','), granularity: requestedGranularity, comparison: 'NONE', tankId: tank?.id }, signal),
    staleTime: 60_000,
  });
  // Custo operacional (fuel_cost, FuelSupply/veiculo) nunca aceita tankId --
  // serie SEMPRE global, numa chamada separada das de tanque acima.
  const costSeries = useQuery({
    queryKey: ['bi', 'kpis', 'series', 'fuel-cost', range, requestedGranularity ?? 'auto'],
    queryFn: ({ signal }) => getKpiSeries({ ...range, kpis: 'fuel_cost', granularity: requestedGranularity, comparison: 'NONE' }, signal),
    staleTime: 60_000,
  });

  // Fase 8, Bloco 6 -- "ultima conferencia": reaproveita o endpoint de
  // evidencia ja existente (ordenado por data desc), 1 registro, em vez de
  // um novo endpoint ou de uma chamada por tanque.
  const lastCheck = useQuery({
    queryKey: ['bi', 'kpis', 'evidence', 'fuel-last-check', range, tank?.id],
    queryFn: ({ signal }) =>
      getKpiEvidence('fuel_reconciliation_divergence_liters', { ...range, source: 'FUEL_TANK_INVENTORY_CHECK', page: 1, pageSize: 1, tankId: tank?.id }, signal),
    staleTime: 60_000,
  });

  // Fase 8, Bloco 3 -- consumo medio da frota: reaproveita GET /fuel-supplies/
  // dashboard (ja existente, ja usado na tela Abastecimentos), UMA chamada
  // para a aba inteira -- nunca uma por veiculo.
  const fuelDashboard = useQuery({
    queryKey: ['fuel-supplies', 'dashboard', 'fuel-tab', range],
    queryFn: ({ signal }) => getFuelDashboard({ supplyDateFrom: range.startDate, supplyDateTo: range.endDate }, signal),
    staleTime: 60_000,
  });

  const seriesData = series.data;
  const effectiveGranularity = seriesData?.granularity ?? requestedGranularity ?? 'day';
  const byId = new Map((seriesData?.series ?? []).map((s) => [s.id, s]));
  const stockSeries = byId.get('fuel_tank_stock');
  const receivedSeries = byId.get('fuel_received_liters');
  const internalSeries = byId.get('fuel_internal_liters');
  const priceSeries = byId.get('fuel_average_purchase_price');
  const divergenceSeries = byId.get('fuel_reconciliation_divergence_liters');
  const pointCount = stockSeries?.points.length ?? 0;
  const operatingCostSeries = costSeries.data?.series.find((s) => s.id === 'fuel_cost');
  const costPointCount = operatingCostSeries?.points.length ?? 0;

  const card = (id: string) => {
    const kpi = activeKpis.get(id);
    const icon = KPI_ICONS[id];
    return kpi ? <KpiCard key={id} kpi={kpi} {...(icon ? { icon } : {})} onExplain={onExplain} /> : null;
  };
  const globalCard = (id: string) => {
    const kpi = kpis.get(id);
    const icon = KPI_ICONS[id];
    return kpi ? <KpiCard key={id} kpi={kpi} {...(icon ? { icon } : {})} onExplain={onExplain} /> : null;
  };

  const insights = buildInsights(INSIGHT_KPIS, activeKpis);
  const lastCheckItem = lastCheck.data?.items[0];

  const totalLitersKpi = kpis.get('fuel_liters');
  const internalLitersKpiGlobal = kpis.get('fuel_internal_liters');

  if (noTanks) {
    return (
      <EmptyState
        icon={Fuel}
        title="Nenhum tanque próprio cadastrado"
        description="Cadastre um tanque em Tanques (menu Combustível) para acompanhar aqui o estoque, entradas, abastecimentos e custo do diesel."
      />
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <Block
        title="Filtro de combustível"
        description="Restringe os indicadores de tanque desta aba a um tanque próprio. Sem seleção, mostra a soma de todos os tanques."
        action={
          <EntitySelect<FuelTankEntity>
            queryKey={['fuel-tanks', 'picker']}
            queryFn={() => listFuelTanks({ pageSize: 100 })}
            getOptionValue={(t) => t.id}
            getOptionLabel={(t) => t.name}
            value={tank?.id ?? ''}
            onChange={(value) => setTank(tanksQuery.data?.items.find((t) => t.id === value) ?? null)}
            placeholder="Todos os tanques"
          />
        }
      >
        <></>
      </Block>

      <Block title="O que mudou" description="Comparado ao período anterior. Sem causa atribuída — a interpretação é do gestor.">
        <InsightList insights={insights} onSelect={(id) => { const kpi = activeKpis.get(id); if (kpi) onExplain(kpi); }} />
      </Block>

      {/* BLOCO 1 -- ESTOQUE: "quanto diesel temos agora?" */}
      <Block title="Estoque" description="Saldo reconstruído a partir do ledger de movimentações -- nunca uma soma de movimentações do período.">
        {hasFilter && scopedSummary.isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Carregando estoque">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        )}
        {hasFilter && scopedSummary.isError && (
          <ErrorState title="Não foi possível carregar os indicadores do filtro." onRetry={() => scopedSummary.refetch()} />
        )}
        {(!hasFilter || scopedSummary.data) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {card('fuel_tank_stock')}
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-sm font-medium text-ink-muted">Capacidade total</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-ink">{totalCapacity !== null ? `${formatNumber(totalCapacity)} L` : '—'}</p>
              <p className="mt-2 text-xs text-ink-subtle">{tankCount} tanque{tankCount === 1 ? '' : 's'} próprio{tankCount === 1 ? '' : 's'}</p>
            </div>
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-sm font-medium text-ink-muted">Estoque mínimo (soma)</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-ink">{totalMinStock !== null ? `${formatNumber(totalMinStock)} L` : '—'}</p>
              <p className="mt-2 text-xs text-ink-subtle">
                {tanksWithMinStock.length > 0 ? `${tanksWithMinStock.length} tanque(s) com mínimo definido` : 'Nenhum tanque com mínimo definido'}
              </p>
            </div>
          </div>
        )}

        {series.isLoading && (
          <div aria-busy="true" aria-label="Carregando evolução do estoque">
            <Skeleton className="h-64 w-full" />
          </div>
        )}
        {series.isError && <ErrorState title="Não foi possível carregar a evolução." onRetry={() => series.refetch()} />}
        {seriesData && pointCount < 2 && (
          <EmptyState title="Período curto demais para mostrar evolução" description="Escolha 7 dias ou mais, ou agrupe por um intervalo menor." />
        )}
        {seriesData && pointCount >= 2 && stockSeries && (
          <Card>
            <CardHeader
              title="Evolução do estoque"
              action={<GranularityControl value={effectiveGranularity} range={range} onChange={onGranularityChange} />}
            />
            <CardBody>
              <TrendLineChart rows={toSeriesRows(stockSeries, effectiveGranularity)} unit={stockSeries.unit} name={stockSeries.name} showPrevious={false} />
            </CardBody>
          </Card>
        )}
      </Block>

      {/* BLOCO 2 -- COMPRA: "quanto estamos comprando e pagando?" */}
      <Block title="Compra" description="Litros recebidos, valor pago e preço médio de compra -- nunca chamado de custo médio do estoque.">
        {(!hasFilter || scopedSummary.data) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {card('fuel_received_liters')}
            {card('fuel_received_cost')}
            {card('fuel_average_purchase_price')}
          </div>
        )}
        {seriesData && pointCount >= 2 && receivedSeries && priceSeries ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Litros recebidos por intervalo" />
              <CardBody>
                <TrendLineChart rows={toSeriesRows(receivedSeries, effectiveGranularity)} unit={receivedSeries.unit} name={receivedSeries.name} showPrevious={false} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Preço médio de compra por intervalo" />
              <CardBody>
                <TrendLineChart rows={toSeriesRows(priceSeries, effectiveGranularity)} unit={priceSeries.unit} name={priceSeries.name} showPrevious={false} />
              </CardBody>
            </Card>
          </div>
        ) : series.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : null}
      </Block>

      {/* BLOCO 3 -- CONSUMO: "quanto combustível estamos usando?" */}
      <Block title="Consumo" description="Litros abastecidos internamente e desempenho por veículo. Consumo/km só aparece quando os dados oficiais existirem.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(!hasFilter || scopedSummary.data) && card('fuel_internal_liters')}
          <div className="rounded-lg border border-border bg-white p-4">
            <p className="text-sm font-medium text-ink-muted">Consumo médio da frota</p>
            <div className="mt-3 text-2xl font-semibold tracking-tight text-ink">
              {fuelDashboard.isLoading ? <Skeleton className="h-7 w-24" /> : fuelDashboard.data?.averageConsumptionKmL ? `${formatNumber(fuelDashboard.data.averageConsumptionKmL, 1)} km/L` : '—'}
            </div>
            <p className="mt-2 text-xs text-ink-subtle">Todos os abastecimentos (interno + externo), mesmo cálculo da tela Abastecimentos.</p>
          </div>
        </div>
        {seriesData && pointCount >= 2 && internalSeries && (
          <Card>
            <CardHeader title="Abastecimento interno por intervalo" />
            <CardBody>
              <TrendLineChart rows={toSeriesRows(internalSeries, effectiveGranularity)} unit={internalSeries.unit} name={internalSeries.name} showPrevious={false} />
            </CardBody>
          </Card>
        )}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink">Ranking de veículos</h3>
          <FuelVehicleTable range={range} />
        </div>
      </Block>

      {/* BLOCO 4 -- CUSTO OPERACIONAL: reaproveita fuel_cost/cost_per_km ja
          existentes (FuelSupply) -- nunca um segundo "custo de combustivel". */}
      <Block
        title="Custo operacional"
        description="Custo de combustível é o que a operação gastou abastecendo veículos -- pode diferir do valor comprado para o tanque no mesmo período."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {globalCard('fuel_cost')}
          {globalCard('cost_per_km')}
          <div className="flex items-center gap-3 rounded-lg border border-info-100 bg-info-50 p-4 text-sm text-info-700">
            <Route size={18} className="shrink-0" aria-hidden />
            <span>Custo de combustível (operação) e valor comprado (Bloco Compra) são métricas relacionadas, não necessariamente iguais no mesmo período.</span>
          </div>
        </div>
        {costSeries.isLoading && <Skeleton className="h-64 w-full" />}
        {costSeries.isError && <ErrorState title="Não foi possível carregar a evolução do custo." onRetry={() => costSeries.refetch()} />}
        {costSeries.data && costPointCount < 2 && (
          <EmptyState title="Período curto demais para mostrar evolução" description="Escolha 7 dias ou mais, ou agrupe por um intervalo menor." />
        )}
        {costSeries.data && costPointCount >= 2 && operatingCostSeries && (
          <Card>
            <CardHeader title="Custo de combustível por intervalo" />
            <CardBody>
              <TrendLineChart
                rows={toSeriesRows(operatingCostSeries, costSeries.data.granularity)}
                unit={operatingCostSeries.unit}
                name={operatingCostSeries.name}
                showPrevious={false}
              />
            </CardBody>
          </Card>
        )}
      </Block>

      {/* BLOCO 5 -- INTERNO x EXTERNO (Fase 7) */}
      <Block title="Interno × externo" description="De onde veio o diesel usado pelos veículos no período -- sempre a visão de todos os tanques.">
        {totalLitersKpi?.value !== null && totalLitersKpi?.value !== undefined && internalLitersKpiGlobal?.value !== null && internalLitersKpiGlobal?.value !== undefined ? (
          <Card>
            <CardBody>
              <OriginSplit totalLiters={totalLitersKpi.value} internalLiters={internalLitersKpiGlobal.value} />
            </CardBody>
          </Card>
        ) : (
          <EmptyState title="Dados insuficientes no período" description="Nenhum abastecimento (interno ou externo) registrado no período selecionado." />
        )}
      </Block>

      {/* BLOCO 6 -- CONTROLE: "estamos controlando o estoque corretamente?" */}
      <Block title="Controle" description="Divergência de inventário e ajustes -- o sinal é sempre preservado (positivo = sobra, negativo = falta).">
        {(!hasFilter || scopedSummary.data) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {card('fuel_reconciliation_divergence_liters')}
            {card('fuel_adjustment_liters')}
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="text-sm font-medium text-ink-muted">Última conferência</p>
              <div className="mt-3 text-lg font-semibold tracking-tight text-ink">
                {lastCheck.isLoading ? <Skeleton className="h-6 w-32" /> : lastCheckItem?.date ? formatDate(lastCheckItem.date) : '—'}
              </div>
              <p className="mt-2 text-xs text-ink-subtle">
                {lastCheck.data ? `${formatNumber(lastCheck.data.meta.total)} conferência(s) no período` : ''}
                {lastCheckItem?.description ? ` — ${lastCheckItem.description}` : lastCheck.data && lastCheck.data.meta.total === 0 ? 'Nenhuma conferência de estoque registrada no período.' : ''}
              </p>
            </div>
          </div>
        )}
        {seriesData && pointCount >= 2 && divergenceSeries && (
          <Card>
            <CardHeader title="Divergência de estoque por intervalo" />
            <CardBody>
              <TrendLineChart rows={toSeriesRows(divergenceSeries, effectiveGranularity)} unit={divergenceSeries.unit} name={divergenceSeries.name} showPrevious={false} />
            </CardBody>
          </Card>
        )}
      </Block>

      <Block title="Desempenho por tanque" description="Estoque, entradas, abastecimentos, ajustes e custo de recebimento por tanque. Nunca soma entre períodos.">
        <FuelTankTable range={range} />
      </Block>
    </div>
  );
}
