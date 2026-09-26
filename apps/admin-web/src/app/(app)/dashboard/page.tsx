'use client';

import { useQuery } from '@tanstack/react-query';
import { Info, ShieldAlert } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { EmptyState } from '../../../components/ui/empty-state';
import { ErrorState } from '../../../components/ui/error-state';
import { FullPageLoading } from '../../../components/ui/loading-state';
import { PageHeader } from '../../../components/ui/page-header';
import { Skeleton } from '../../../components/ui/skeleton';
import { Tabs } from '../../../components/ui/tabs';
import {
  DEFAULT_INTELLIGENCE_TAB,
  INTELLIGENCE_TAB_CONFIG,
  isIntelligenceTab,
  type IntelligenceTab,
} from '../../../features/intelligence/intelligence-config';
import { CostsTab } from '../../../features/intelligence/costs-tab';
import { DeadlinesTab } from '../../../features/intelligence/deadlines-tab';
import { FinancialTab } from '../../../features/intelligence/financial-tab';
import { FleetTab } from '../../../features/intelligence/fleet-tab';
import { KpiDetailDrawer } from '../../../features/intelligence/kpi-detail-drawer';
import { indexKpis } from '../../../features/intelligence/kpi-format';
import { OperationTab } from '../../../features/intelligence/operation-tab';
import { OverviewTab } from '../../../features/intelligence/overview-tab';
import {
  DEFAULT_PERIOD_PRESET,
  formatPeriodLabel,
  isPeriodPreset,
  resolvePeriodRange,
  type PeriodPreset,
} from '../../../features/intelligence/period';
import { PeriodSelector } from '../../../features/intelligence/period-selector';
import { UpcomingTab } from '../../../features/intelligence/upcoming-tab';
import { useAuth } from '../../../hooks/use-auth';
import { getKpiSummary } from '../../../lib/api/bi.api';
import { ApiError } from '../../../lib/api/errors';
import { DASHBOARD_ROLES, hasRole } from '../../../lib/auth/roles';
import type { KpiGranularity, KpiResultEntity } from '../../../types/entities';

const DATA_TABS: IntelligenceTab[] = ['overview', 'operation', 'financial', 'fleet', 'costs', 'deadlines'];
const GRANULARITIES: KpiGranularity[] = ['day', 'week', 'month'];
const timeFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

function LoadingKpis(): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Carregando indicadores">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="rounded-lg border border-border bg-white p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-7 w-32" />
          <Skeleton className="mt-3 h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

// BI 2 -- /dashboard passa a ser a Central de Inteligencia. Todos os
// numeros vem da camada oficial de KPIs (GET /bi/kpis/summary): uma unica
// chamada por periodo, compartilhada por Visao geral e Operacao. Aba e
// periodo ficam na URL (?aba=&periodo=&de=&ate=&agrupar=) para links e voltar/avancar.
// BI 3 -- aba Financeiro: mesmo summary + /bi/kpis/series e /bi/kpis/breakdown.
function IntelligenceCenter(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const allowed = hasRole(user?.role, DASHBOARD_ROLES);

  const tabParam = searchParams.get('aba');
  const periodParam = searchParams.get('periodo');
  const tab: IntelligenceTab = isIntelligenceTab(tabParam) ? tabParam : DEFAULT_INTELLIGENCE_TAB;
  const preset: PeriodPreset = isPeriodPreset(periodParam) ? periodParam : DEFAULT_PERIOD_PRESET;
  const customFrom = searchParams.get('de') ?? '';
  const customTo = searchParams.get('ate') ?? '';
  const granularityParam = searchParams.get('agrupar');
  const granularity = GRANULARITIES.find((g) => g === granularityParam) ?? null;

  const [explained, setExplained] = useState<KpiResultEntity | null>(null);

  const updateParams = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '') params.delete(key);
        else params.set(key, value);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : (pathname ?? '/dashboard'), { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Limites em dias locais: o intervalo e estavel durante o dia inteiro, e a
  // queryKey (comparada por valor) reaproveita o cache entre as abas.
  const range = resolvePeriodRange(preset, new Date(), { from: customFrom, to: customTo });

  const needsData = DATA_TABS.includes(tab);
  const summary = useQuery({
    queryKey: ['bi', 'kpis', 'summary', range],
    queryFn: ({ signal }) => {
      if (!range) throw new Error('Período inválido.');
      return getKpiSummary({ startDate: range.startDate, endDate: range.endDate }, signal);
    },
    enabled: allowed && needsData && range !== null,
    staleTime: 60_000,
  });

  const kpis = useMemo(() => indexKpis(summary.data?.kpis), [summary.data]);
  const activeTab = INTELLIGENCE_TAB_CONFIG.find((config) => config.value === tab);

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Central de Inteligência" />
        <EmptyState
          icon={ShieldAlert}
          title="Acesso restrito"
          description="Os indicadores da Central estão disponíveis para administradores e gestores."
        />
      </div>
    );
  }

  const forbidden = summary.error instanceof ApiError && summary.error.statusCode === 403;
  const noMovement =
    summary.data !== undefined &&
    summary.data.kpis.every((kpi) => kpi.value === null || kpi.value === 0 || kpi.unit === 'PERCENT');

  return (
    <div>
      <PageHeader
        title="Central de Inteligência"
        description="Indicadores oficiais da operação, com comparação ao período anterior."
        actions={
          <PeriodSelector
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            onPresetChange={(value) =>
              updateParams({ periodo: value === DEFAULT_PERIOD_PRESET ? null : value, ...(value === 'custom' ? {} : { de: null, ate: null }) })
            }
            onCustomChange={({ from, to }) => updateParams({ periodo: 'custom', de: from, ate: to })}
          />
        }
      />

      <Tabs
        tabs={INTELLIGENCE_TAB_CONFIG.map((config) => ({ value: config.value, label: config.label }))}
        active={tab}
        onChange={(value) => updateParams({ aba: value === DEFAULT_INTELLIGENCE_TAB ? null : value })}
      />

      <div className="mt-5" role="tabpanel" aria-label={activeTab?.label}>
        {needsData && summary.data && (
          <p className="mb-5 text-sm text-ink-muted">
            <span className="font-medium text-ink">{formatPeriodLabel(summary.data.period.start, summary.data.period.end)}</span>
            {summary.data.comparisonPeriod && (
              <>
                {' '}comparado com {formatPeriodLabel(summary.data.comparisonPeriod.start, summary.data.comparisonPeriod.end)}
              </>
            )}
            <span className="text-ink-subtle">. Atualizado às {timeFormatter.format(new Date(summary.data.calculatedAt))}.</span>
          </p>
        )}

        {needsData && range === null && (
          <EmptyState title="Escolha o período" description="Informe a data inicial e a final para ver os indicadores." />
        )}

        {needsData && range !== null && summary.isLoading && <LoadingKpis />}

        {needsData && summary.isError && (
          <ErrorState
            title={forbidden ? 'Você não tem acesso a estes indicadores.' : 'Não foi possível carregar os indicadores.'}
            description={forbidden ? undefined : 'Verifique a conexão e tente de novo.'}
            onRetry={forbidden ? undefined : () => summary.refetch()}
          />
        )}

        {needsData && noMovement && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-info-100 bg-info-50 px-4 py-3 text-sm text-info-700">
            <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
            Nenhuma movimentação registrada no período. Tente um período maior.
          </div>
        )}

        {tab === 'overview' && summary.data && <OverviewTab kpis={kpis} onExplain={setExplained} />}
        {tab === 'operation' && summary.data && <OperationTab kpis={kpis} onExplain={setExplained} />}
        {tab === 'financial' && summary.data && range && (
          <FinancialTab
            kpis={kpis}
            range={range}
            granularity={granularity}
            onGranularityChange={(value) => updateParams({ agrupar: value })}
            onExplain={setExplained}
          />
        )}
        {tab === 'fleet' && summary.data && range && (
          <FleetTab
            kpis={kpis}
            range={range}
            granularity={granularity}
            onGranularityChange={(value) => updateParams({ agrupar: value })}
            onExplain={setExplained}
          />
        )}
        {tab === 'costs' && summary.data && range && (
          <CostsTab
            kpis={kpis}
            range={range}
            granularity={granularity}
            onGranularityChange={(value) => updateParams({ agrupar: value })}
            onExplain={setExplained}
          />
        )}
        {tab === 'deadlines' && summary.data && range && (
          <DeadlinesTab
            kpis={kpis}
            range={range}
            granularity={granularity}
            onGranularityChange={(value) => updateParams({ agrupar: value })}
            onExplain={setExplained}
          />
        )}
        {activeTab?.upcoming && <UpcomingTab tab={activeTab} />}
      </div>

      <KpiDetailDrawer kpi={explained} onClose={() => setExplained(null)} />
    </div>
  );
}

export default function DashboardPage(): JSX.Element {
  // useSearchParams exige Suspense no App Router (renderizacao estatica).
  return (
    <Suspense fallback={<FullPageLoading />}>
      <IntelligenceCenter />
    </Suspense>
  );
}
