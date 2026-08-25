'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Ban, CheckCircle2, Package, Pencil, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { SearchInput } from '../../../components/ui/search-input';
import { Select } from '../../../components/ui/select';
import { StatCard } from '../../../components/ui/stat-card';
import { useToast } from '../../../components/ui/toast';
import { useAuth } from '../../../hooks/use-auth';
import { useDebounce } from '../../../hooks/use-debounce';
import { CreatePartModal } from '../../../features/parts/create-part-modal';
import { toFriendlyMessage } from '../../../lib/api/errors';
import { getPartsDashboard, listParts, updatePartStatus } from '../../../lib/api/parts.api';
import { FLEET_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import type { PartEntity } from '../../../types/entities';
import { formatCurrency, formatNumber } from '../../../utils/format';

const PAGE_SIZE = 20;

export default function PartsPage(): JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canWrite = hasRole(user?.role, FLEET_WRITE_ROLES);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [isActive, setIsActive] = useState<'true' | 'false' | ''>('');
  const [lowStock, setLowStock] = useState<'true' | ''>('');
  const [zeroStock, setZeroStock] = useState<'true' | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounce(search);
  const debouncedCategory = useDebounce(category);
  const hasActiveFilters = Boolean(search || category || isActive || lowStock || zeroStock);

  const dashboardQuery = useQuery({
    queryKey: ['parts', 'dashboard'],
    queryFn: ({ signal }) => getPartsDashboard({}, signal),
  });

  const query = useQuery({
    queryKey: ['parts', { page, search: debouncedSearch, category: debouncedCategory, isActive, lowStock, zeroStock }],
    queryFn: ({ signal }) =>
      listParts(
        {
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          category: debouncedCategory || undefined,
          isActive: isActive === '' ? undefined : isActive === 'true',
          lowStock: lowStock === '' ? undefined : true,
          zeroStock: zeroStock === '' ? undefined : true,
        },
        signal,
      ),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updatePartStatus(id, active),
    onSuccess: () => {
      toast.success('Status da peça atualizado.');
      queryClient.invalidateQueries({ queryKey: ['parts'] });
    },
    onError: (error) => toast.error('Não foi possível atualizar o status.', toFriendlyMessage(error)),
  });

  const columns = useMemo<ColumnDef<PartEntity, unknown>[]>(
    () => [
      {
        header: 'SKU / Nome',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink">{row.original.sku}</p>
            <p className="text-xs text-ink-subtle">{row.original.name}</p>
          </div>
        ),
      },
      { header: 'Categoria', accessorFn: (row) => row.category ?? '—' },
      {
        header: 'Estoque',
        cell: ({ row }) => (
          <span>
            {formatNumber(row.original.currentStock)} {row.original.unit}
            {row.original.minStock !== null && (
              <span className="ml-1 text-xs text-ink-subtle">(mín. {formatNumber(row.original.minStock)})</span>
            )}
          </span>
        ),
      },
      {
        header: 'Situação',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.isZeroStock ? (
              <Badge tone="danger">Zerado</Badge>
            ) : row.original.isLowStock ? (
              <Badge tone="warning">Baixo</Badge>
            ) : (
              <Badge tone="success">Normal</Badge>
            )}
          </div>
        ),
      },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={row.original.isActive ? 'success' : 'neutral'}>{row.original.isActive ? 'Ativa' : 'Inativa'}</Badge>
        ),
      },
      ...(canWrite
        ? [
            {
              header: 'Ações',
              id: 'actions',
              cell: ({ row }: { row: { original: PartEntity } }) => {
                const p = row.original;
                return (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Ver detalhe"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/parts/${p.id}`);
                      }}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title={p.isActive ? 'Desativar' : 'Ativar'}
                      disabled={statusMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        statusMutation.mutate({ id: p.id, active: !p.isActive });
                      }}
                    >
                      {p.isActive ? <Ban size={14} /> : <CheckCircle2 size={14} />}
                    </Button>
                  </div>
                );
              },
            },
          ]
        : []),
    ],
    [canWrite, router, statusMutation],
  );

  return (
    <div>
      <PageHeader
        title="Peças"
        description="Catálogo de peças e controle de estoque para manutenção da frota."
        actions={
          canWrite && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Nova peça
            </Button>
          )
        }
      />

      {dashboardQuery.data && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Peças cadastradas" value={String(dashboardQuery.data.totalParts)} icon={Package} />
          <StatCard label="Ativas" value={String(dashboardQuery.data.activeParts)} tone="success" />
          <StatCard
            label="Estoque baixo"
            value={String(dashboardQuery.data.lowStockCount)}
            icon={AlertTriangle}
            tone={dashboardQuery.data.lowStockCount > 0 ? 'warning' : 'success'}
          />
          <StatCard
            label="Estoque zerado"
            value={String(dashboardQuery.data.zeroStockCount)}
            icon={AlertTriangle}
            tone={dashboardQuery.data.zeroStockCount > 0 ? 'danger' : 'success'}
          />
          <div title={dashboardQuery.data.estimatedStockValueUnavailableReason ?? undefined}>
            <StatCard
              label="Valor estimado do estoque"
              value={
                dashboardQuery.data.estimatedStockValue !== null
                  ? formatCurrency(dashboardQuery.data.estimatedStockValue)
                  : '—'
              }
            />
          </div>
          <StatCard label="Entradas (total)" value={formatNumber(dashboardQuery.data.entriesInPeriod)} />
        </div>
      )}

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setSearch('');
          setCategory('');
          setIsActive('');
          setLowStock('');
          setZeroStock('');
          setPage(1);
        }}
      >
        <FormField label="Buscar" htmlFor="part-search" className="w-full sm:w-56">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Nome, SKU ou código OEM..."
          />
        </FormField>
        <FormField label="Categoria" htmlFor="part-category" className="w-full sm:w-40">
          <SearchInput
            value={category}
            onChange={(v) => {
              setCategory(v);
              setPage(1);
            }}
            placeholder="Filtros..."
          />
        </FormField>
        <FormField label="Status" htmlFor="part-active" className="w-full sm:w-36">
          <Select
            id="part-active"
            value={isActive}
            onChange={(e) => {
              setIsActive(e.target.value as 'true' | 'false' | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            <option value="true">Ativas</option>
            <option value="false">Inativas</option>
          </Select>
        </FormField>
        <FormField label="Estoque baixo" htmlFor="part-low" className="w-full sm:w-36">
          <Select
            id="part-low"
            value={lowStock}
            onChange={(e) => {
              setLowStock(e.target.value as 'true' | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            <option value="true">Somente baixo</option>
          </Select>
        </FormField>
        <FormField label="Estoque zerado" htmlFor="part-zero" className="w-full sm:w-36">
          <Select
            id="part-zero"
            value={zeroStock}
            onChange={(e) => {
              setZeroStock(e.target.value as 'true' | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            <option value="true">Somente zerado</option>
          </Select>
        </FormField>
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => query.refetch()}
          onRowClick={(p) => router.push(`/parts/${p.id}`)}
          getRowId={(p) => p.id}
          emptyTitle="Nenhuma peça encontrada"
          emptyDescription="Não existem peças para os filtros selecionados."
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreatePartModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
