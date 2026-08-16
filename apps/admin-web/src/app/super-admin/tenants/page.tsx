'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
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
import { useDebounce } from '../../../hooks/use-debounce';
import { CreateTenantModal } from '../../../features/super-admin/create-tenant-modal';
import { listTenants } from '../../../lib/api/super-admin.api';
import { TENANT_PLAN_TIER_LABELS, TENANT_STATUS_LABELS, TENANT_STATUS_TONE } from '../../../lib/labels';
import type { TenantListItemEntity } from '../../../types/entities';
import type { TenantStatus } from '../../../types/enums';
import { formatDate, formatNumber } from '../../../utils/format';

const PAGE_SIZE = 20;

export default function SuperAdminTenantsPage(): JSX.Element {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TenantStatus | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounce(search);

  const query = useQuery({
    queryKey: ['super-admin', 'tenants', { page, search: debouncedSearch, status }],
    queryFn: ({ signal }) =>
      listTenants(
        { page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined, status: status || undefined },
        signal,
      ),
  });

  const columns = useMemo<ColumnDef<TenantListItemEntity, unknown>[]>(
    () => [
      {
        header: 'Transportadora',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink">{row.original.name}</p>
            <p className="text-xs text-ink-subtle">{row.original.tradeName ?? row.original.document}</p>
          </div>
        ),
      },
      {
        header: 'Status',
        cell: ({ row }) => <Badge tone={TENANT_STATUS_TONE[row.original.status]}>{TENANT_STATUS_LABELS[row.original.status]}</Badge>,
      },
      { header: 'Plano', cell: ({ row }) => (row.original.plan ? TENANT_PLAN_TIER_LABELS[row.original.plan.tier] : '—') },
      { header: 'Usuários', accessorFn: (row) => formatNumber(row.userCount) },
      { header: 'Veículos', accessorFn: (row) => formatNumber(row.vehicleCount) },
      { header: 'Criada em', accessorFn: (row) => formatDate(row.createdAt) },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Transportadoras"
        description="Todas as transportadoras clientes da plataforma."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Nova transportadora
          </Button>
        }
      />

      <FilterBar
        hasActiveFilters={Boolean(search || status)}
        onClear={() => {
          setSearch('');
          setStatus('');
          setPage(1);
        }}
      >
        <FormField label="Buscar" htmlFor="tenant-search" className="w-full sm:w-64">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Nome, CNPJ, slug..."
          />
        </FormField>
        <FormField label="Status" htmlFor="tenant-status" className="w-full sm:w-48">
          <Select
            id="tenant-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as TenantStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(TENANT_STATUS_LABELS) as TenantStatus[]).map((s) => (
              <option key={s} value={s}>
                {TENANT_STATUS_LABELS[s]}
              </option>
            ))}
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
          onRowClick={(tenant) => router.push(`/super-admin/tenants/${tenant.id}`)}
          getRowId={(tenant) => tenant.id}
          emptyTitle="Nenhuma transportadora encontrada"
          emptyDescription="Não existem transportadoras para os filtros selecionados."
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreateTenantModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
