'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CircleAlert, Info, ListChecks } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { DataTable } from '../../../../../components/ui/data-table';
import { ErrorState } from '../../../../../components/ui/error-state';
import { FilterBar } from '../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../components/ui/form-field';
import { PageHeader } from '../../../../../components/ui/page-header';
import { Pagination } from '../../../../../components/ui/pagination';
import { Select } from '../../../../../components/ui/select';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { getFinanceReconciliation } from '../../../../../lib/api/finance-reconciliation.api';
import {
  RECONCILIATION_ENTITY_TYPE_LABELS,
  RECONCILIATION_ISSUE_TYPE_LABELS,
  RECONCILIATION_SEVERITY_LABELS,
  RECONCILIATION_SEVERITY_TONE,
} from '../../../../../lib/labels';
import type {
  FinanceReconciliationIssueEntity,
  ReconciliationEntityType,
  ReconciliationIssueType,
  ReconciliationSeverity,
} from '../../../../../types/entities';
import { formatCurrency, formatDateTime } from '../../../../../utils/format';

const PAGE_SIZE = 20;
const ISSUE_TYPES = Object.keys(RECONCILIATION_ISSUE_TYPE_LABELS) as ReconciliationIssueType[];
const ENTITY_TYPES = Object.keys(RECONCILIATION_ENTITY_TYPE_LABELS) as ReconciliationEntityType[];
const SEVERITIES: ReconciliationSeverity[] = ['CRITICAL', 'WARNING', 'INFO'];

export default function FinanceReconciliationPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [type, setType] = useState<ReconciliationIssueType | ''>('');
  const [severity, setSeverity] = useState<ReconciliationSeverity | ''>('');
  const [entityType, setEntityType] = useState<ReconciliationEntityType | ''>('');

  const filters = {
    type: type || undefined,
    severity: severity || undefined,
    entityType: entityType || undefined,
  };
  const hasActiveFilters = Boolean(type || severity || entityType);

  const query = useQuery({
    queryKey: ['finance', 'reconciliation', { page, ...filters }],
    queryFn: () => getFinanceReconciliation({ page, pageSize: PAGE_SIZE, ...filters }),
  });

  const columns: ColumnDef<FinanceReconciliationIssueEntity, unknown>[] = [
    {
      header: 'Severidade',
      cell: ({ row }) => (
        <Badge tone={RECONCILIATION_SEVERITY_TONE[row.original.severity]}>{RECONCILIATION_SEVERITY_LABELS[row.original.severity]}</Badge>
      ),
    },
    { header: 'Tipo', cell: ({ row }) => RECONCILIATION_ISSUE_TYPE_LABELS[row.original.type] },
    { header: 'Origem', cell: ({ row }) => RECONCILIATION_ENTITY_TYPE_LABELS[row.original.entityType] },
    {
      header: 'Valor',
      cell: ({ row }) => (row.original.amount !== null ? formatCurrency(row.original.amount) : '—'),
    },
    { header: 'Descrição', cell: ({ row }) => <span className="block max-w-md text-ink-muted">{row.original.description}</span> },
    { header: 'Detectado em', cell: ({ row }) => formatDateTime(row.original.detectedAt) },
    {
      header: 'Ações',
      cell: ({ row }) =>
        row.original.tripId ? (
          <a href={`/trips/${row.original.tripId}`}>
            <Button size="sm" variant="outline">
              Ver viagem
            </Button>
          </a>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Conciliação financeira"
        description="Inconsistências detectadas entre faturamento, contas a receber/pagar e seus pagamentos — projeção calculada ao vivo, nunca corrige nada automaticamente."
      />

      {query.isLoading && <SkeletonCards count={4} />}
      {query.isError && <ErrorState onRetry={() => query.refetch()} />}

      {query.data && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total de inconsistências" value={String(query.data.summary.totalIssues)} icon={ListChecks} />
          <StatCard label="Críticas" value={String(query.data.summary.criticalCount)} icon={CircleAlert} tone="danger" />
          <StatCard label="Atenção" value={String(query.data.summary.warningCount)} icon={AlertTriangle} tone="warning" />
          <StatCard label="Informativas" value={String(query.data.summary.infoCount)} icon={Info} tone="info" />
        </div>
      )}

      {query.data && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Contas a receber" value={String(query.data.summary.totalReceivableIssues)} />
          <StatCard label="Contas a pagar" value={String(query.data.summary.totalPayableIssues)} />
          <StatCard label="Faturamentos" value={String(query.data.summary.totalBillingIssues)} />
          <StatCard label="Despesas" value={String(query.data.summary.totalExpenseIssues)} />
        </div>
      )}

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setType('');
          setSeverity('');
          setEntityType('');
          setPage(1);
        }}
      >
        <FormField label="Tipo" htmlFor="reconciliation-type" className="w-full sm:w-64">
          <Select
            id="reconciliation-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as ReconciliationIssueType | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {ISSUE_TYPES.map((t) => (
              <option key={t} value={t}>
                {RECONCILIATION_ISSUE_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Severidade" htmlFor="reconciliation-severity" className="w-full sm:w-40">
          <Select
            id="reconciliation-severity"
            value={severity}
            onChange={(e) => {
              setSeverity(e.target.value as ReconciliationSeverity | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {RECONCILIATION_SEVERITY_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Origem" htmlFor="reconciliation-entity" className="w-full sm:w-44">
          <Select
            id="reconciliation-entity"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value as ReconciliationEntityType | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {ENTITY_TYPES.map((e) => (
              <option key={e} value={e}>
                {RECONCILIATION_ENTITY_TYPE_LABELS[e]}
              </option>
            ))}
          </Select>
        </FormField>
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={query.data?.issues.items ?? []}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => query.refetch()}
          getRowId={(i) => `${i.type}-${i.entityId}`}
          emptyTitle="Nenhuma inconsistência encontrada"
          emptyDescription="Os ledgers financeiros estão consistentes no escopo/filtro selecionado."
        />
        {query.data && <Pagination meta={query.data.issues.meta} onPageChange={setPage} />}
      </div>
    </div>
  );
}
