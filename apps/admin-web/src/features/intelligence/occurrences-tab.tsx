'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertOctagon, AlertTriangle, Clock, MapPin, PackageCheck, Receipt, Route as RouteIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Badge } from '../../components/ui/badge';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { EntitySelect } from '../../components/ui/entity-select';
import { ErrorState } from '../../components/ui/error-state';
import { Pagination } from '../../components/ui/pagination';
import { Skeleton } from '../../components/ui/skeleton';
import { getKpiBreakdown, getKpiEvidence, getKpiSeries, getKpiSummary } from '../../lib/api/bi.api';
import { listFleets } from '../../lib/api/fleet.api';
import { TRIP_OCCURRENCE_SEVERITY_LABELS, TRIP_OCCURRENCE_SEVERITY_TONE, TRIP_OCCURRENCE_TYPE_LABELS } from '../../lib/labels';
import type { FleetEntity, KpiBreakdownItemEntity, KpiGranularity, KpiResultEntity, VehicleEntity } from '../../types/entities';
import type { TripOccurrenceSeverity, TripOccurrenceType } from '../../types/enums';
import { formatNumber } from '../../utils/format';
import { TrendLegend, TrendLineChart } from './financial-charts';
import { FleetVehiclePicker } from './fleet-vehicle-picker';
import { KpiCard } from './kpi-card';
import { indexKpis } from './kpi-format';
import type { OccurrenceMapPoint } from './occurrence-map';
import { OccurrenceVehicleTable } from './occurrence-vehicle-table';
import type { PeriodRange } from './period';
import { GRANULARITY_LABELS, isGranularityAllowed, toSeriesRows } from './series-format';

// Mapa acessa `window` (Leaflet) -- nunca no SSR.
const OccurrenceMap = dynamic(() => import('./occurrence-map').then((m) => m.OccurrenceMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const MAIN = [
  { id: 'occurrences_total', icon: AlertTriangle },
  { id: 'occurrences_critical', icon: AlertOctagon },
];
const CONTEXT = [
  { id: 'trips_completed', icon: RouteIcon },
  { id: 'deliveries_completed', icon: PackageCheck },
  { id: 'on_time_delivery_rate', icon: Clock },
  { id: 'operating_cost', icon: Receipt },
];

const SERIES_KPIS = ['occurrences_total', 'occurrences_critical'];
const RECORDS_PAGE_SIZE = 10;
// Tabela investigativa (por veiculo) reaproveita occurrences_total/critical +
// trips_completed; o mapa reaproveita a MESMA evidencia oficial (nunca uma
// segunda consulta equivalente), so com um pageSize maior para render.
const MAP_PAGE_SIZE = 100;

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

// "Concentração" por categoria (tipo ou severidade): so KPIs SOMAVEIS tem
// share valido aqui (occurrences_total/critical x type/severity) -- nunca um
// grafico para so 2-3 fatias. "Demais" preserva soma(items)+others=total,
// mesmo padrao das tabelas por veiculo.
function CategoryBreakdownList({
  items,
  others,
  labelFor,
  toneFor,
}: {
  items: KpiBreakdownItemEntity[];
  others: KpiBreakdownItemEntity | null;
  labelFor: (key: string) => string;
  toneFor?: (key: string) => 'info' | 'warning' | 'danger';
}): JSX.Element {
  const rows = others ? [...items, others] : items;
  if (rows.length === 0) return <EmptyState title="Nenhuma ocorrência no período" />;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((it) => {
        const tone = it.key ? toneFor?.(it.key) : undefined;
        return (
          <li key={it.key ?? it.label}>
            <div className="flex items-center justify-between gap-3 text-sm">
              {tone ? <Badge tone={tone}>{it.key ? labelFor(it.key) : it.label}</Badge> : <span className="text-ink">{it.key ? labelFor(it.key) : it.label}</span>}
              <span className="tabular-nums text-ink">
                {it.value === null ? '—' : formatNumber(it.value)}
                {it.share !== null && <span className="ml-2 text-xs text-ink-muted">{formatNumber(it.share, 1)}%</span>}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${it.share ?? 0}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// BI 8 -- aba Ocorrências: o que aconteceu -> onde -> quando -> o que se
// repete -> onde investigar. occurrences_total/occurrences_critical sao os
// UNICOS KPIs oficiais desta aba; os demais (secao "Contexto") ja existem no
// MESMO summary, so reorganizados aqui.
export function OccurrencesTab({
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
  const [recordsPage, setRecordsPage] = useState(1);
  const hasFilter = Boolean(vehicle || fleetId);
  const requestedGranularity = granularity && isGranularityAllowed(granularity, range.startDate, range.endDate) ? granularity : undefined;
  const scope = { vehicleId: vehicle?.id, fleetId: fleetId || undefined };

  const scopedSummary = useQuery({
    queryKey: ['bi', 'kpis', 'summary', 'occurrences-scope', range, vehicle?.id, fleetId],
    queryFn: ({ signal }) =>
      getKpiSummary({ ...range, kpis: [...MAIN, ...CONTEXT].map((s) => s.id).join(','), ...scope }, signal),
    enabled: hasFilter,
    staleTime: 60_000,
  });
  const activeKpis = hasFilter ? indexKpis(scopedSummary.data?.kpis) : kpis;

  const series = useQuery({
    queryKey: ['bi', 'kpis', 'series', 'occurrences', range, requestedGranularity ?? 'auto', vehicle?.id, fleetId],
    queryFn: ({ signal }) =>
      getKpiSeries({ ...range, kpis: SERIES_KPIS.join(','), granularity: requestedGranularity, comparison: 'PREVIOUS_PERIOD', ...scope }, signal),
    staleTime: 60_000,
  });
  const seriesData = series.data;
  const effectiveGranularity = seriesData?.granularity ?? requestedGranularity ?? 'day';
  const byId = new Map((seriesData?.series ?? []).map((s) => [s.id, s]));
  const pointCount = seriesData?.series[0]?.points.length ?? 0;

  const byType = useQuery({
    queryKey: ['bi', 'kpis', 'breakdown', 'occurrences-type', range, vehicle?.id, fleetId],
    queryFn: ({ signal }) => getKpiBreakdown({ ...range, kpiId: 'occurrences_total', dimension: 'type', limit: 8, ...scope }, signal),
    staleTime: 60_000,
  });
  const bySeverity = useQuery({
    queryKey: ['bi', 'kpis', 'breakdown', 'occurrences-severity', range, vehicle?.id, fleetId],
    queryFn: ({ signal }) => getKpiBreakdown({ ...range, kpiId: 'occurrences_total', dimension: 'severity', limit: 8, ...scope }, signal),
    staleTime: 60_000,
  });

  const mapEvidence = useQuery({
    queryKey: ['bi', 'kpis', 'evidence', 'occurrences-map', range, vehicle?.id, fleetId],
    queryFn: ({ signal }) =>
      getKpiEvidence('occurrences_total', { ...range, source: 'TRIP_OCCURRENCE', page: 1, pageSize: MAP_PAGE_SIZE, ...scope }, signal),
    staleTime: 60_000,
  });
  const geoPoints: OccurrenceMapPoint[] = (mapEvidence.data?.items ?? [])
    .filter((it) => it.latitude !== null && it.longitude !== null)
    .map((it) => ({
      id: it.id,
      latitude: it.latitude as number,
      longitude: it.longitude as number,
      severity: it.severity ?? 'INFO',
      description: it.description,
      locationLabel: it.locationLabel,
      vehicleId: it.vehicleId,
      tripId: it.tripId,
    }));

  const records = useQuery({
    queryKey: ['bi', 'kpis', 'evidence', 'occurrences-records', range, recordsPage, vehicle?.id, fleetId],
    queryFn: ({ signal }) =>
      getKpiEvidence('occurrences_total', { ...range, source: 'TRIP_OCCURRENCE', page: recordsPage, pageSize: RECORDS_PAGE_SIZE, ...scope }, signal),
    staleTime: 60_000,
  });

  const card = (id: string, icon: (typeof MAIN)[number]['icon']) => {
    const kpi = activeKpis.get(id);
    return kpi ? <KpiCard key={id} kpi={kpi} icon={icon} onExplain={onExplain} /> : null;
  };

  return (
    <div className="flex flex-col gap-10">
      <Block
        title="Filtro de ocorrências"
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

      <Block title="O que está acontecendo?" description="Total de ocorrências e críticas no período, com contexto operacional.">
        {hasFilter && scopedSummary.isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Carregando indicadores de ocorrências">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        )}
        {hasFilter && scopedSummary.isError && (
          <ErrorState title="Não foi possível carregar os indicadores do filtro." onRetry={() => scopedSummary.refetch()} />
        )}
        {(!hasFilter || scopedSummary.data) && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{MAIN.map(({ id, icon }) => card(id, icon))}</div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{CONTEXT.map(({ id, icon }) => card(id, icon))}</div>
          </div>
        )}
      </Block>

      <Block
        title="Como isso evoluiu?"
        description="Cada ponto usa o mesmo cálculo oficial do resumo acima, aplicado ao intervalo."
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
          <div aria-busy="true" aria-label="Carregando evolução das ocorrências">
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
              {SERIES_KPIS.map((id) => {
                const s = byId.get(id);
                if (!s) return null;
                return (
                  <Card key={id}>
                    <CardHeader title={s.name} />
                    <CardBody>
                      <TrendLineChart rows={toSeriesRows(s, effectiveGranularity)} unit={s.unit} name={s.name} showPrevious={showPrevious} />
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </Block>

      <Block title="O que se repete?" description="Concentração por tipo de ocorrência e por severidade no período.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Por tipo" />
            <CardBody>
              {byType.isLoading && <Skeleton className="h-48 w-full" />}
              {byType.isError && <ErrorState title="Não foi possível carregar a distribuição por tipo." onRetry={() => byType.refetch()} />}
              {byType.data && (
                <CategoryBreakdownList
                  items={byType.data.items}
                  others={byType.data.others}
                  labelFor={(key) => TRIP_OCCURRENCE_TYPE_LABELS[key as TripOccurrenceType] ?? key}
                />
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Por severidade" />
            <CardBody>
              {bySeverity.isLoading && <Skeleton className="h-48 w-full" />}
              {bySeverity.isError && <ErrorState title="Não foi possível carregar a distribuição por severidade." onRetry={() => bySeverity.refetch()} />}
              {bySeverity.data && (
                <CategoryBreakdownList
                  items={bySeverity.data.items}
                  others={bySeverity.data.others}
                  labelFor={(key) => TRIP_OCCURRENCE_SEVERITY_LABELS[key as TripOccurrenceSeverity] ?? key}
                  toneFor={(key) => TRIP_OCCURRENCE_SEVERITY_TONE[key as TripOccurrenceSeverity] ?? 'info'}
                />
              )}
            </CardBody>
          </Card>
        </div>
      </Block>

      <Block
        title="Onde está concentrado?"
        description="Localização real registrada nas ocorrências (Driver App). Sem coordenadas suficientes, nenhuma posição é estimada."
      >
        <Card>
          <CardBody className="h-96 p-0">
            {mapEvidence.isLoading && <Skeleton className="h-full w-full" />}
            {mapEvidence.isError && <ErrorState title="Não foi possível carregar a localização das ocorrências." onRetry={() => mapEvidence.refetch()} />}
            {mapEvidence.data && geoPoints.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <EmptyState
                  icon={MapPin}
                  title="Nenhuma ocorrência com localização no período"
                  description="As ocorrências deste período/escopo não têm latitude/longitude registradas. Use as distribuições por tipo, severidade e veículo acima."
                />
              </div>
            )}
            {mapEvidence.data && geoPoints.length > 0 && <OccurrenceMap points={geoPoints} />}
          </CardBody>
        </Card>
        {mapEvidence.data && geoPoints.length > 0 && geoPoints.length < mapEvidence.data.meta.total && (
          <p className="text-xs text-ink-subtle">
            {geoPoints.length} de {mapEvidence.data.meta.total} ocorrências do período têm localização registrada.
          </p>
        )}
      </Block>

      <Block
        title="Onde devo investigar? — por veículo"
        description="Ocorrências e críticas por veículo, com viagens do período como contexto. Ordene ou busque — não é uma classificação de veículo problemático."
      >
        {vehicle ? (
          <EmptyState
            title="Filtro já restrito a 1 veículo"
            description="Limpe o filtro de veículo acima para comparar todos os veículos da frota."
          />
        ) : (
          <OccurrenceVehicleTable range={range} fleetId={fleetId || null} />
        )}
      </Block>

      <Block title="Onde devo investigar? — registros" description="Registros de origem (TripOccurrence) que compõem os totais acima.">
        <Card>
          <CardBody className="p-0">
            {records.isLoading && (
              <div className="p-5">
                <Skeleton className="h-40 w-full" />
              </div>
            )}
            {records.isError && (
              <div className="p-5">
                <ErrorState title="Não foi possível carregar os registros." onRetry={() => records.refetch()} />
              </div>
            )}
            {records.data && records.data.items.length === 0 && <EmptyState title="Nenhuma ocorrência no período/escopo" />}
            {records.data && records.data.items.length > 0 && (
              <>
                <ul className="divide-y divide-border">
                  {records.data.items.map((item) => (
                    <li key={item.id} className="flex flex-col gap-1.5 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {item.severity && (
                            <Badge tone={TRIP_OCCURRENCE_SEVERITY_TONE[item.severity as TripOccurrenceSeverity] ?? 'info'}>
                              {TRIP_OCCURRENCE_SEVERITY_LABELS[item.severity as TripOccurrenceSeverity] ?? item.severity}
                            </Badge>
                          )}
                          <span className="text-sm text-ink">{item.description}</span>
                        </div>
                        <span className="text-xs text-ink-subtle">
                          {item.date ? new Date(item.date).toLocaleString('pt-BR') : '—'}
                          {item.locationLabel ? ` · ${item.locationLabel}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        {item.vehicleId && (
                          <Link href={`/vehicles/${item.vehicleId}`} className="font-medium text-brand-700 hover:text-brand-900">
                            Ver veículo
                          </Link>
                        )}
                        {item.tripId && (
                          <Link href={`/trips/${item.tripId}`} className="font-medium text-brand-700 hover:text-brand-900">
                            Ver viagem
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <Pagination meta={records.data.meta} onPageChange={setRecordsPage} />
              </>
            )}
          </CardBody>
        </Card>
      </Block>
    </div>
  );
}
