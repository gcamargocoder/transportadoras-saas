'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';
import { EmptyState } from '../../components/ui/empty-state';
import { EntitySelect } from '../../components/ui/entity-select';
import { ErrorState } from '../../components/ui/error-state';
import { Skeleton } from '../../components/ui/skeleton';
import { getAlerts } from '../../lib/api/bi.api';
import { listFleets } from '../../lib/api/fleet.api';
import type { BiAlertEntity, BiAlertSeverity, FleetEntity, KpiGranularity, KpiComparisonMode, KpiResultEntity, VehicleEntity } from '../../types/entities';
import { ALERT_SEVERITY_BORDER, ALERT_SEVERITY_ICON, ALERT_SEVERITY_OPTIONS, ALERT_SEVERITY_RANK, ALERT_SEVERITY_TONE, alertSeverityLabel } from './alert-severity';
import { buildAlertMessage } from './alert-format';
import { cn } from '../../utils/cn';
import { ComparisonModePicker, resolveCompareRange } from './comparison-mode-picker';
import { FleetVehiclePicker } from './fleet-vehicle-picker';
import type { PeriodRange } from './period';

function Block({ title, description, children }: { title: string; description: string; children: ReactNode }): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="text-sm text-ink-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

// BI 10 -- prioridade -> alerta -> contexto -> evidencia -> investigacao.
// Nunca so cor: severidade sempre acompanhada de rotulo textual (Badge) e
// icone proprio. "Investigar" reaproveita onExplain/KpiDetailDrawer (mesmo
// "Como e calculado" + evidencias de todas as outras abas).
function AlertRow({ alert, onExplain }: { alert: BiAlertEntity; onExplain: (kpi: KpiResultEntity) => void }): JSX.Element {
  const Icon = ALERT_SEVERITY_ICON[alert.severity];
  const severityLabel = alertSeverityLabel(alert.severity);
  return (
    <li className={cn('flex flex-col gap-2 border-l-4 bg-white px-4 py-3 sm:flex-row sm:items-start sm:justify-between', ALERT_SEVERITY_BORDER[alert.severity])}>
      <div className="flex flex-1 items-start gap-3">
        <Icon size={18} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ALERT_SEVERITY_TONE[alert.severity]}>{severityLabel}</Badge>
            <span className="text-sm font-semibold text-ink">{alert.name}</span>
          </div>
          <p className="mt-1 text-sm text-ink-muted">{buildAlertMessage(alert)}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onExplain(alert.kpi)}
        className="shrink-0 self-start rounded-md text-xs font-medium text-violet-700 hover:text-violet-900 sm:self-center"
        aria-label={`Investigar: ${alert.name}`}
      >
        Investigar
      </button>
    </li>
  );
}

// BI 10 -- aba Alertas: camada deterministica sobre os KPIs oficiais (BI 1-9).
// Nenhum calculo aqui -- so busca /bi/alerts (que ja avalia as regras em
// lote no backend) e apresenta prioridade -> alerta -> investigacao.
export function AlertsTab({
  range,
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
  const [severities, setSeverities] = useState<Set<BiAlertSeverity>>(new Set());

  const compareRange = resolveCompareRange(comparisonMode, compareFrom, compareTo);
  const customIncomplete = comparisonMode === 'CUSTOM' && compareRange === null;
  const severityKey = [...severities].sort().join(',');

  const alerts = useQuery({
    queryKey: ['bi', 'alerts', range, comparisonMode, compareRange, vehicle?.id, fleetId, severityKey],
    queryFn: ({ signal }) =>
      getAlerts(
        {
          ...range,
          comparison: comparisonMode,
          compareStartDate: compareRange?.startDate,
          compareEndDate: compareRange?.endDate,
          vehicleId: vehicle?.id,
          fleetId: fleetId || undefined,
          severity: severityKey || undefined,
        },
        signal,
      ),
    enabled: !customIncomplete,
    staleTime: 60_000,
  });

  const items = [...(alerts.data?.items ?? [])].sort((a, b) => ALERT_SEVERITY_RANK[a.severity] - ALERT_SEVERITY_RANK[b.severity]);
  const counts: Record<BiAlertSeverity, number> = { CRITICAL: 0, WARNING: 0, INFO: 0 };
  for (const item of items) counts[item.severity] += 1;

  function toggleSeverity(value: BiAlertSeverity) {
    setSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-10">
      <Block title="Filtro de alertas" description="Escolha com o que comparar o período e, opcionalmente, restrinja a um veículo, frota ou severidade.">
        <div className="flex flex-col gap-3">
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
            <div role="group" aria-label="Filtrar por severidade" className="flex gap-1">
              {ALERT_SEVERITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={severities.has(option.value)}
                  onClick={() => toggleSeverity(option.value)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                    severities.has(option.value) ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-border text-ink-muted hover:text-ink',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Block>

      <Block title="Atenção agora" description="Alertas determinísticos avaliados sobre os KPIs oficiais do período — nenhuma causalidade inferida.">
        {customIncomplete && (
          <EmptyState title="Escolha o período de referência" description="Informe a data inicial e a final da comparação personalizada." />
        )}
        {!customIncomplete && alerts.isLoading && (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando alertas">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}
        {!customIncomplete && alerts.isError && <ErrorState title="Não foi possível carregar os alertas." onRetry={() => alerts.refetch()} />}
        {!customIncomplete && alerts.data && items.length === 0 && (
          <EmptyState
            icon={CheckCircle2}
            title="Nenhum alerta no período"
            description="Os indicadores oficiais deste período/escopo estão dentro do esperado pelas regras vigentes."
          />
        )}
        {!customIncomplete && alerts.data && items.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2">
              {ALERT_SEVERITY_OPTIONS.map(
                (option) =>
                  counts[option.value] > 0 && (
                    <Badge key={option.value} tone={ALERT_SEVERITY_TONE[option.value]}>
                      {counts[option.value]} {option.label.toLowerCase()}
                    </Badge>
                  ),
              )}
            </div>
            <Card>
              <ul className="divide-y divide-border">
                {items.map((alert) => (
                  <AlertRow key={alert.id} alert={alert} onExplain={onExplain} />
                ))}
              </ul>
            </Card>
          </>
        )}
      </Block>
    </div>
  );
}
