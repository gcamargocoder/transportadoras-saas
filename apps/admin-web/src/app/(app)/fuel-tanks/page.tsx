'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Ban, CheckCircle2, Cylinder, Pencil, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { RadialGauge } from '../../../components/ui/radial-gauge';
import { SearchInput } from '../../../components/ui/search-input';
import { Select } from '../../../components/ui/select';
import { StatCard } from '../../../components/ui/stat-card';
import { useToast } from '../../../components/ui/toast';
import { useAuth } from '../../../hooks/use-auth';
import { useDebounce } from '../../../hooks/use-debounce';
import { CreateFuelTankModal } from '../../../features/fuel-tanks/create-fuel-tank-modal';
import { toFriendlyMessage } from '../../../lib/api/errors';
import { listFuelTanks, updateFuelTankStatus } from '../../../lib/api/fuel-tanks.api';
import { FUEL_SUPPLY_READ_ROLES, FUEL_SUPPLY_WRITE_ROLES, hasRole } from '../../../lib/auth/roles';
import { FUEL_TYPE_LABELS } from '../../../lib/labels';
import type { FuelTankEntity } from '../../../types/entities';
import { formatNumber } from '../../../utils/format';

const PAGE_SIZE = 20;

export default function FuelTanksPage(): JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canRead = hasRole(user?.role, FUEL_SUPPLY_READ_ROLES);
  const canWrite = hasRole(user?.role, FUEL_SUPPLY_WRITE_ROLES);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isActive, setIsActive] = useState<'true' | 'false' | ''>('');
  const [lowStock, setLowStock] = useState<'true' | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounce(search);
  const hasActiveFilters = Boolean(search || isActive || lowStock);

  const query = useQuery({
    queryKey: ['fuel-tanks', { page, search: debouncedSearch, isActive, lowStock }],
    queryFn: ({ signal }) =>
      listFuelTanks(
        {
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          isActive: isActive === '' ? undefined : isActive === 'true',
          lowStock: lowStock === '' ? undefined : true,
        },
        signal,
      ),
    enabled: canRead,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateFuelTankStatus(id, active),
    onSuccess: () => {
      toast.success('Status do tanque atualizado.');
      queryClient.invalidateQueries({ queryKey: ['fuel-tanks'] });
    },
    onError: (error) => toast.error('Não foi possível atualizar o status.', toFriendlyMessage(error)),
  });

  const lowStockCount = query.data?.items.filter((t) => t.isLowStock).length ?? 0;
  const activeCount = query.data?.items.filter((t) => t.status === 'ACTIVE').length ?? 0;

  const columns = useMemo<ColumnDef<FuelTankEntity, unknown>[]>(
    () => [
      {
        header: 'Tanque',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink">{row.original.name}</p>
            <p className="text-xs text-ink-subtle">
              {FUEL_TYPE_LABELS[row.original.fuelType]}
              {row.original.location ? ` · ${row.original.location}` : ''}
            </p>
          </div>
        ),
      },
      {
        header: 'Ocupação',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <RadialGauge percentage={row.original.occupancyPercent} size={44} />
            <div className="text-xs text-ink-subtle">
              <p className="font-medium text-ink">
                {formatNumber(row.original.currentStockLiters)} / {formatNumber(row.original.capacityLiters)} L
              </p>
              {row.original.minStockLiters !== null && <p>mín. {formatNumber(row.original.minStockLiters)} L</p>}
            </div>
          </div>
        ),
      },
      {
        header: 'Situação',
        cell: ({ row }) =>
          row.original.isLowStock ? <Badge tone="warning">Estoque baixo</Badge> : <Badge tone="success">Normal</Badge>,
      },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={row.original.status === 'ACTIVE' ? 'success' : 'neutral'}>
            {row.original.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
          </Badge>
        ),
      },
      ...(canWrite
        ? [
            {
              header: 'Ações',
              id: 'actions',
              cell: ({ row }: { row: { original: FuelTankEntity } }) => {
                const t = row.original;
                return (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Ver detalhe"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/fuel-tanks/${t.id}`);
                      }}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title={t.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
                      disabled={statusMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        statusMutation.mutate({ id: t.id, active: t.status !== 'ACTIVE' });
                      }}
                    >
                      {t.status === 'ACTIVE' ? <Ban size={14} /> : <CheckCircle2 size={14} />}
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
        title="Tanques"
        description="Estoque de diesel nos tanques próprios da transportadora."
        actions={
          canWrite && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Novo tanque
            </Button>
          )
        }
      />

      {query.data && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="Tanques cadastrados" value={String(query.data.meta.total)} icon={Cylinder} />
          <StatCard label="Ativos (nesta página)" value={String(activeCount)} tone="success" />
          <StatCard
            label="Estoque baixo (nesta página)"
            value={String(lowStockCount)}
            icon={AlertTriangle}
            tone={lowStockCount > 0 ? 'warning' : 'success'}
          />
        </div>
      )}

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setSearch('');
          setIsActive('');
          setLowStock('');
          setPage(1);
        }}
      >
        <FormField label="Buscar" htmlFor="fuel-tank-search" className="w-full sm:w-56">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Nome ou localização..."
          />
        </FormField>
        <FormField label="Status" htmlFor="fuel-tank-active" className="w-full sm:w-36">
          <Select
            id="fuel-tank-active"
            value={isActive}
            onChange={(e) => {
              setIsActive(e.target.value as 'true' | 'false' | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </Select>
        </FormField>
        <FormField label="Estoque baixo" htmlFor="fuel-tank-low" className="w-full sm:w-36">
          <Select
            id="fuel-tank-low"
            value={lowStock}
            onChange={(e) => {
              setLowStock(e.target.value as 'true' | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            <option value="true">Somente baixo</option>
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
          onRowClick={(t) => router.push(`/fuel-tanks/${t.id}`)}
          getRowId={(t) => t.id}
          emptyTitle="Nenhum tanque encontrado"
          emptyDescription="Não existem tanques para os filtros selecionados."
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreateFuelTankModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
