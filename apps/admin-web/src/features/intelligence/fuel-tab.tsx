'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardList, Droplets, Fuel, Gauge, Scale, Wallet } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { EntitySelect } from '../../components/ui/entity-select';
import { ErrorState } from '../../components/ui/error-state';
import { Skeleton } from '../../components/ui/skeleton';
import { getKpiSeries, getKpiSummary } from '../../lib/api/bi.api';
import { listFuelTanks } from '../../lib/api/fuel-tanks.api';
import type { FuelTankEntity, KpiGranularity, KpiResultEntity } from '../../types/entities';
import { TrendLineChart } from './financial-charts';
import { FuelTankTable } from './fuel-tank-table';
import { FuelVehicleTable } from './fuel-vehicle-table';
import { KpiCard } from './kpi-card';
import { indexKpis } from './kpi-format';
import type { PeriodRange } from './period';
import { GRANULARITY_LABELS, isGranularityAllowed, toSeriesRows } from './series-format';

// Fase 6 -- resumo do ledger do tanque proprio (FuelTankMovement). Fonte
// SEPARADA de fuel_cost/fuel_liters (FuelSupply, consumo do veiculo, ja na
// aba Custos): aqui e o estoque que a empresa possui.
const STOCK_SUMMARY = [
  { id: 'fuel_tank_stock', icon: Gauge },
  { id: 'fuel_received_liters', icon: Droplets },
  { id: 'fuel_internal_liters', icon: Fuel },
  { id: 'fuel_adjustment_liters', icon: Scale },
];

const FINANCIAL_SUMMARY = [
  { id: 'fuel_received_cost', icon: Wallet },
  { id: 'fuel_average_purchase_price', icon: Wallet },
  { id: 'fuel_movements_count', icon: ClipboardList },
  { id: 'fuel_reconciliation_divergence_liters', icon: AlertTriangle },
];

const SERIES_KPIS = ['fuel_tank_stock', 'fuel_received_liters', 'fuel_internal_liters'];

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

// Fase 6 -- Fundacao do BI de Combustivel. Reaproveita 100% a infraestrutura
// do BI 1-11 (mesmo /bi/kpis/summary|series|breakdown ja usado pelas outras
// abas): nenhuma formula nova, so os 8 KPIs do ledger de tanque expostos no
// catalogo. Filtro por tanque (mesmo padrao de veiculo/frota da aba Custos):
// sem selecao, mostra a soma de todos os tanques proprios; com selecao,
// dispara UM summary/serie adicionais escopados por tankId.
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

  const scopedSummary = useQuery({
    queryKey: ['bi', 'kpis', 'summary', 'fuel-scope', range, tank?.id],
    queryFn: ({ signal }) =>
      getKpiSummary({ ...range, kpis: [...STOCK_SUMMARY, ...FINANCIAL_SUMMARY].map((s) => s.id).join(','), tankId: tank?.id }, signal),
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
  const seriesData = series.data;
  const effectiveGranularity = seriesData?.granularity ?? requestedGranularity ?? 'day';
  const byId = new Map((seriesData?.series ?? []).map((s) => [s.id, s]));
  const stockSeries = byId.get('fuel_tank_stock');
  const receivedSeries = byId.get('fuel_received_liters');
  const internalSeries = byId.get('fuel_internal_liters');
  const pointCount = stockSeries?.points.length ?? 0;

  const card = (id: string, icon: (typeof STOCK_SUMMARY)[number]['icon']) => {
    const kpi = activeKpis.get(id);
    return kpi ? <KpiCard key={id} kpi={kpi} icon={icon} onExplain={onExplain} /> : null;
  };

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
        description="Restringe os indicadores desta aba a um tanque próprio. Sem seleção, mostra a soma de todos os tanques."
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

      <Block title="Estoque e movimentação" description="Saldo reconstruído a partir do ledger de movimentações do tanque no período.">
        {hasFilter && scopedSummary.isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Carregando indicadores de combustível">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        )}
        {hasFilter && scopedSummary.isError && (
          <ErrorState title="Não foi possível carregar os indicadores do filtro." onRetry={() => scopedSummary.refetch()} />
        )}
        {(!hasFilter || scopedSummary.data) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{STOCK_SUMMARY.map(({ id, icon }) => card(id, icon))}</div>
        )}
      </Block>

      <Block title="Compras e conferência" description="Custo, preço médio de compra, movimentações e divergência de estoque no período.">
        {(!hasFilter || scopedSummary.data) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{FINANCIAL_SUMMARY.map(({ id, icon }) => card(id, icon))}</div>
        )}
      </Block>

      <Block
        title="Evolução do estoque"
        description="Saldo do tanque ao fim de cada intervalo -- ponto no tempo, nunca uma soma de movimentações."
        action={<GranularityControl value={effectiveGranularity} range={range} onChange={onGranularityChange} />}
      >
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
            <CardHeader title="Estoque no fim do intervalo" />
            <CardBody>
              <TrendLineChart rows={toSeriesRows(stockSeries, effectiveGranularity)} unit={stockSeries.unit} name={stockSeries.name} showPrevious={false} />
            </CardBody>
          </Card>
        )}
      </Block>

      <Block title="Entradas × abastecimento interno" description="Litros recebidos (compra) contra litros dispensados para veículos, por intervalo.">
        {seriesData && pointCount >= 2 && receivedSeries && internalSeries ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title={receivedSeries.name} />
              <CardBody>
                <TrendLineChart rows={toSeriesRows(receivedSeries, effectiveGranularity)} unit={receivedSeries.unit} name={receivedSeries.name} showPrevious={false} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={internalSeries.name} />
              <CardBody>
                <TrendLineChart rows={toSeriesRows(internalSeries, effectiveGranularity)} unit={internalSeries.unit} name={internalSeries.name} showPrevious={false} />
              </CardBody>
            </Card>
          </div>
        ) : series.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <p className="text-sm text-ink-muted">Escolha um período maior para ver a evolução ao longo do tempo.</p>
        )}
      </Block>

      <Block title="Desempenho por tanque" description="Estoque, entradas, abastecimentos, ajustes e custo de recebimento por tanque. Nunca soma entre períodos.">
        <FuelTankTable range={range} />
      </Block>

      <Block
        title="Abastecimento interno por veículo"
        description="Litros e número de abastecimentos internos por veículo. Custo não aparece aqui: abastecimento interno não tem preço próprio."
      >
        <FuelVehicleTable range={range} tankId={tank?.id ?? null} />
      </Block>
    </div>
  );
}
