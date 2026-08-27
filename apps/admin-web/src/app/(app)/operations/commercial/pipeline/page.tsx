'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Kanban, List, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { DataTable } from '../../../../../components/ui/data-table';
import { EntitySelect } from '../../../../../components/ui/entity-select';
import { FilterBar } from '../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../components/ui/form-field';
import { PageHeader } from '../../../../../components/ui/page-header';
import { Pagination } from '../../../../../components/ui/pagination';
import { Select } from '../../../../../components/ui/select';
import { SearchInput } from '../../../../../components/ui/search-input';
import { StatCard } from '../../../../../components/ui/stat-card';
import { useAuth } from '../../../../../hooks/use-auth';
import { useDebounce } from '../../../../../hooks/use-debounce';
import { OpportunityFormModal } from '../../../../../features/pipeline/opportunity-form-modal';
import { PipelineBoard } from '../../../../../features/pipeline/pipeline-board';
import {
  listPipelineOpportunities,
  listPipelineStages,
  getPipelineDashboard,
} from '../../../../../lib/api/pipeline.api';
import { listCustomers } from '../../../../../lib/api/trips.api';
import { PIPELINE_WRITE_ROLES, hasRole } from '../../../../../lib/auth/roles';
import type { PipelineOpportunityEntity } from '../../../../../types/entities';
import { formatCurrency, formatDate, formatPercent } from '../../../../../utils/format';
import { cn } from '../../../../../utils/cn';

const PAGE_SIZE = 20;

export default function PipelineCommercialPage(): JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [stageId, setStageId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounce(search);

  const dashboardQuery = useQuery({ queryKey: ['pipeline', 'dashboard'], queryFn: () => getPipelineDashboard() });
  const stagesQuery = useQuery({ queryKey: ['pipeline', 'stages'], queryFn: () => listPipelineStages() });

  const hasActiveFilters = Boolean(search || customerId || stageId);

  const listQuery = useQuery({
    queryKey: ['pipeline', 'opportunities', { page, search: debouncedSearch, customerId, stageId }],
    queryFn: ({ signal }) =>
      listPipelineOpportunities(
        { page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined, customerId: customerId || undefined, stageId: stageId || undefined },
        signal,
      ),
    enabled: view === 'list',
  });

  const columns = useMemo<ColumnDef<PipelineOpportunityEntity, unknown>[]>(
    () => [
      { header: 'Oportunidade', accessorFn: (row) => row.title || '—' },
      { header: 'Cliente', accessorFn: (row) => row.customerName ?? '—' },
      {
        header: 'Estágio',
        cell: ({ row }) => (
          <Badge tone={row.original.stageIsWon ? 'success' : row.original.stageIsLost ? 'danger' : 'neutral'}>
            {row.original.stageName ?? '—'}
          </Badge>
        ),
      },
      { header: 'Valor estimado', cell: ({ row }) => formatCurrency(row.original.estimatedValue) },
      { header: 'Criada em', cell: ({ row }) => formatDate(row.original.createdAt) },
    ],
    [],
  );

  const dashboard = dashboardQuery.data;

  return (
    <div>
      <PageHeader
        title="Pipeline Comercial"
        description="Acompanhamento de oportunidades desde a cotação até o fechamento."
        actions={
          hasRole(user?.role, PIPELINE_WRITE_ROLES) && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Nova oportunidade
            </Button>
          )
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Abertas" value={dashboard ? String(dashboard.openCount) : '—'} tone="brand" />
        <StatCard label="Valor estimado aberto" value={dashboard ? formatCurrency(dashboard.openEstimatedValue) : '—'} />
        <StatCard label="Ganhas" value={dashboard ? String(dashboard.wonCount) : '—'} tone="success" />
        <StatCard label="Perdidas" value={dashboard ? String(dashboard.lostCount) : '—'} tone="danger" />
        <StatCard label="Conversão" value={dashboard ? formatPercent(dashboard.conversionRate * 100) : '—'} tone="info" />
      </div>

      <div className="mb-4 flex gap-1 rounded-md border border-border bg-white p-1">
        <button
          type="button"
          onClick={() => setView('board')}
          className={cn(
            'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium',
            view === 'board' ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink',
          )}
        >
          <Kanban size={14} />
          Kanban
        </button>
        <button
          type="button"
          onClick={() => setView('list')}
          className={cn(
            'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium',
            view === 'list' ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink',
          )}
        >
          <List size={14} />
          Lista
        </button>
      </div>

      {view === 'board' ? (
        <PipelineBoard />
      ) : (
        <>
          <FilterBar
            hasActiveFilters={hasActiveFilters}
            onClear={() => {
              setSearch('');
              setCustomerId('');
              setStageId('');
              setPage(1);
            }}
          >
            <FormField label="Buscar" htmlFor="opp-search" className="w-full sm:w-64">
              <SearchInput
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setPage(1);
                }}
                placeholder="Título, cliente, observações..."
              />
            </FormField>
            <FormField label="Cliente" htmlFor="opp-filter-customer" className="w-full sm:w-56">
              <EntitySelect
                id="opp-filter-customer"
                queryKey={['customers', 'select']}
                queryFn={() => listCustomers({ pageSize: 100 })}
                getOptionValue={(c) => c.id}
                getOptionLabel={(c) => c.name}
                value={customerId}
                onChange={(v) => {
                  setCustomerId(v);
                  setPage(1);
                }}
                placeholder="Todos"
              />
            </FormField>
            <FormField label="Estágio" htmlFor="opp-filter-stage" className="w-full sm:w-48">
              <Select
                id="opp-filter-stage"
                value={stageId}
                onChange={(e) => {
                  setStageId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos</option>
                {stagesQuery.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </FilterBar>

          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <DataTable
              columns={columns}
              data={listQuery.data?.items ?? []}
              isLoading={listQuery.isLoading}
              isError={listQuery.isError}
              onRetry={() => listQuery.refetch()}
              getRowId={(o) => o.id}
              onRowClick={(o) => router.push(`/operations/commercial/pipeline/${o.id}`)}
              emptyTitle="Nenhuma oportunidade encontrada"
            />
            {listQuery.data && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
          </div>
        </>
      )}

      <OpportunityFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
