'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, CircleSlash, HelpCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { DataTable } from '../../../components/ui/data-table';
import { ErrorState } from '../../../components/ui/error-state';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { Select } from '../../../components/ui/select';
import { SkeletonCards } from '../../../components/ui/skeleton';
import { listTollDataSources, listTollDataSyncRuns } from '../../../lib/api/toll-data.api';
import {
  TOLL_DATA_PROVIDER_LABELS,
  TOLL_DATA_SYNC_STATUS_LABELS,
  TOLL_DATA_SYNC_STATUS_TONE,
} from '../../../lib/labels';
import type { TollDataSourceEntity, TollDataSyncRunEntity } from '../../../types/entities';
import type { TollDataProvider, TollDataSyncStatus } from '../../../types/enums';
import { formatDateTime, formatNumber } from '../../../utils/format';

const PAGE_SIZE = 20;
const ALL_PROVIDERS = Object.keys(TOLL_DATA_PROVIDER_LABELS) as TollDataProvider[];
const ALL_STATUSES = Object.keys(TOLL_DATA_SYNC_STATUS_LABELS) as TollDataSyncStatus[];

// Fase "Alertas de sincronizacao" -- saude da fonte NUNCA e um campo
// persistido a parte: derivada so dos 3 timestamps ja existentes desde a
// Fase 33 (lastSyncAt/lastSuccessAt/lastFailureAt), mesma logica usada por
// TollDataSyncService.checkPersistentFailure para decidir o alerta (aqui
// so para exibicao -- nunca decide nada, o alerta real e sempre o
// backend). "Com falha" = a ULTIMA execucao concluida foi uma falha (falha
// mais recente que o ultimo sucesso, ou nunca houve sucesso).
type SourceHealth = 'ok' | 'failing' | 'never-synced' | 'disabled';

function computeHealth(source: TollDataSourceEntity): SourceHealth {
  if (!source.enabled) return 'disabled';
  if (!source.lastFailureAt) return source.lastSuccessAt ? 'ok' : 'never-synced';
  if (!source.lastSuccessAt) return 'failing';
  return new Date(source.lastFailureAt) > new Date(source.lastSuccessAt) ? 'failing' : 'ok';
}

const HEALTH_CONFIG: Record<SourceHealth, { label: string; tone: 'success' | 'danger' | 'neutral' | 'warning'; icon: typeof CheckCircle2 }> = {
  ok: { label: 'Em dia', tone: 'success', icon: CheckCircle2 },
  failing: { label: 'Com falha', tone: 'danger', icon: AlertTriangle },
  'never-synced': { label: 'Nunca sincronizada', tone: 'warning', icon: HelpCircle },
  disabled: { label: 'Desabilitada', tone: 'neutral', icon: CircleSlash },
};

export default function SuperAdminTollDataPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [provider, setProvider] = useState<TollDataProvider | ''>('');
  const [status, setStatus] = useState<TollDataSyncStatus | ''>('');

  const sourcesQuery = useQuery({
    queryKey: ['super-admin', 'toll-data', 'sources'],
    queryFn: ({ signal }) => listTollDataSources(signal),
    // Fase "Alertas de sincronizacao" -- status muda no maximo 1x/dia
    // (TOLL_DATA_SYNC_CRON), mas um admin pode disparar POST /toll-data/sync
    // manualmente enquanto esta tela esta aberta -- refetch periodico curto
    // o suficiente para refletir isso sem virar polling agressivo.
    refetchInterval: 30_000,
  });

  const runsQuery = useQuery({
    queryKey: ['super-admin', 'toll-data', 'sync-runs', { page, provider, status }],
    queryFn: ({ signal }) =>
      listTollDataSyncRuns({ page, pageSize: PAGE_SIZE, provider: provider || undefined, status: status || undefined }, signal),
  });

  const sourceColumns = useMemo<ColumnDef<TollDataSourceEntity, unknown>[]>(
    () => [
      {
        header: 'Fonte',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink">{row.original.name}</p>
            <p className="text-xs text-ink-subtle">{TOLL_DATA_PROVIDER_LABELS[row.original.provider]}</p>
          </div>
        ),
      },
      {
        header: 'Status',
        cell: ({ row }) => {
          const health = computeHealth(row.original);
          const config = HEALTH_CONFIG[health];
          const Icon = config.icon;
          return (
            <Badge tone={config.tone}>
              <Icon size={12} />
              {config.label}
            </Badge>
          );
        },
      },
      { header: 'Última execução', accessorFn: (row) => formatDateTime(row.lastSyncAt) },
      { header: 'Última execução bem-sucedida', accessorFn: (row) => formatDateTime(row.lastSuccessAt) },
      {
        header: 'Erro (fonte com falha)',
        cell: ({ row }) =>
          row.original.lastError ? (
            <p className="max-w-md truncate text-danger-700" title={row.original.lastError}>
              {row.original.lastError}
            </p>
          ) : (
            <span className="text-ink-subtle">—</span>
          ),
      },
    ],
    [],
  );

  const runColumns = useMemo<ColumnDef<TollDataSyncRunEntity, unknown>[]>(
    () => [
      { header: 'Fonte', accessorFn: (row) => TOLL_DATA_PROVIDER_LABELS[row.provider] },
      { header: 'Iniciada em', accessorFn: (row) => formatDateTime(row.startedAt) },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={TOLL_DATA_SYNC_STATUS_TONE[row.original.status]}>{TOLL_DATA_SYNC_STATUS_LABELS[row.original.status]}</Badge>
        ),
      },
      { header: 'Lidos', accessorFn: (row) => formatNumber(row.recordsRead) },
      { header: 'Criados', accessorFn: (row) => formatNumber(row.recordsCreated) },
      { header: 'Atualizados', accessorFn: (row) => formatNumber(row.recordsUpdated) },
      { header: 'Rejeitados', accessorFn: (row) => formatNumber(row.recordsRejected) },
      { header: 'Disparada por', accessorFn: (row) => (row.triggeredBy === 'scheduler' ? 'Agendamento' : (row.triggeredBy ?? '—')) },
      {
        header: 'Erro resumido',
        cell: ({ row }) =>
          row.original.errorMessage ? (
            <p className="max-w-md truncate text-danger-700" title={row.original.errorMessage}>
              {row.original.errorMessage}
            </p>
          ) : (
            <span className="text-ink-subtle">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Sincronização de pedágios"
        description="Status das fontes oficiais de praças e tarifas de pedágio (ANTT, ARTESP, AGETRANSP/RJ) e histórico de execuções."
      />

      {sourcesQuery.isLoading && <SkeletonCards count={4} />}
      {sourcesQuery.isError && <ErrorState onRetry={() => sourcesQuery.refetch()} />}
      {sourcesQuery.data && (
        <div className="mb-6 overflow-hidden rounded-lg border border-border bg-white">
          <DataTable
            columns={sourceColumns}
            data={sourcesQuery.data}
            isLoading={false}
            isError={false}
            getRowId={(source) => source.id}
            emptyTitle="Nenhuma fonte configurada"
            emptyDescription="Nenhuma fonte oficial de dados de pedágio foi sincronizada ainda."
          />
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold text-ink">Histórico de execuções</h2>

      <FilterBar
        hasActiveFilters={Boolean(provider || status)}
        onClear={() => {
          setProvider('');
          setStatus('');
          setPage(1);
        }}
      >
        <FormField label="Fonte" htmlFor="toll-data-provider" className="w-full sm:w-56">
          <Select
            id="toll-data-provider"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value as TollDataProvider | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {ALL_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {TOLL_DATA_PROVIDER_LABELS[p]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Status" htmlFor="toll-data-status" className="w-full sm:w-44">
          <Select
            id="toll-data-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as TollDataSyncStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TOLL_DATA_SYNC_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={runColumns}
          data={runsQuery.data?.items ?? []}
          isLoading={runsQuery.isLoading}
          isError={runsQuery.isError}
          onRetry={() => runsQuery.refetch()}
          getRowId={(run) => run.id}
          emptyTitle="Nenhuma execução encontrada"
          emptyDescription="Não existem execuções de sincronização para os filtros selecionados."
        />
        {runsQuery.data && <Pagination meta={runsQuery.data.meta} onPageChange={setPage} />}
      </div>
    </div>
  );
}
