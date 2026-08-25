'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, CheckCircle2, Pencil, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { DataTable } from '../../components/ui/data-table';
import { FilterBar } from '../../components/ui/filter-bar';
import { FormField } from '../../components/ui/form-field';
import { PageHeader } from '../../components/ui/page-header';
import { Pagination } from '../../components/ui/pagination';
import { SearchInput } from '../../components/ui/search-input';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { useAuth } from '../../hooks/use-auth';
import { useDebounce } from '../../hooks/use-debounce';
import { toFriendlyMessage } from '../../lib/api/errors';
import { listMaintenanceProviders, updateMaintenanceProviderStatus } from '../../lib/api/maintenance-providers.api';
import { FLEET_WRITE_ROLES, hasRole } from '../../lib/auth/roles';
import type { MaintenanceProviderEntity } from '../../types/entities';
import type { MaintenanceProviderType } from '../../types/enums';
import { CreateProviderModal } from './create-provider-modal';

const PAGE_SIZE = 20;

// Componente compartilhado entre /workshops e /suppliers -- oficina e
// fornecedor sao a MESMA entidade no backend (MaintenanceProvider,
// discriminada por `type`), entao a tela tambem e uma so, parametrizada,
// evitando duas paginas quase identicas (ver docs/maintenance-providers.md).
export function MaintenanceProviderListPage({
  type,
  title,
  description,
  detailBasePath,
}: {
  type: MaintenanceProviderType;
  title: string;
  description: string;
  detailBasePath: string;
}): JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canWrite = hasRole(user?.role, FLEET_WRITE_ROLES);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isActive, setIsActive] = useState<'true' | 'false' | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounce(search);
  const hasActiveFilters = Boolean(search || isActive);

  const query = useQuery({
    queryKey: ['maintenance-providers', type, { page, search: debouncedSearch, isActive }],
    queryFn: ({ signal }) =>
      listMaintenanceProviders(
        {
          type,
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          isActive: isActive === '' ? undefined : isActive === 'true',
        },
        signal,
      ),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateMaintenanceProviderStatus(id, active),
    onSuccess: () => {
      toast.success('Status atualizado.');
      queryClient.invalidateQueries({ queryKey: ['maintenance-providers'] });
    },
    onError: (error) => toast.error('Não foi possível atualizar o status.', toFriendlyMessage(error)),
  });

  const columns = useMemo<ColumnDef<MaintenanceProviderEntity, unknown>[]>(
    () => [
      {
        header: 'Nome',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink">{row.original.name}</p>
            {row.original.tradeName && <p className="text-xs text-ink-subtle">{row.original.tradeName}</p>}
          </div>
        ),
      },
      { header: 'Documento', accessorFn: (row) => row.document ?? '—' },
      { header: 'Telefone', accessorFn: (row) => row.phone ?? '—' },
      { header: 'Contato', accessorFn: (row) => row.contactName ?? '—' },
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
              cell: ({ row }: { row: { original: MaintenanceProviderEntity } }) => {
                const p = row.original;
                return (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Ver detalhe"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`${detailBasePath}/${p.id}`);
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
    [canWrite, detailBasePath, router, statusMutation],
  );

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={
          canWrite && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              Nova {type === 'WORKSHOP' ? 'oficina' : 'fornecedor'}
            </Button>
          )
        }
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setSearch('');
          setIsActive('');
          setPage(1);
        }}
      >
        <FormField label="Buscar" htmlFor="provider-search" className="w-full sm:w-64">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Nome, nome fantasia ou documento..."
          />
        </FormField>
        <FormField label="Status" htmlFor="provider-active" className="w-full sm:w-36">
          <Select
            id="provider-active"
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
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => query.refetch()}
          onRowClick={(p) => router.push(`${detailBasePath}/${p.id}`)}
          getRowId={(p) => p.id}
          emptyTitle={`Nenhuma ${type === 'WORKSHOP' ? 'oficina' : 'fornecedor'} encontrada`}
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreateProviderModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        type={type}
        title={`Nova ${type === 'WORKSHOP' ? 'oficina' : 'fornecedor'}`}
      />
    </div>
  );
}
