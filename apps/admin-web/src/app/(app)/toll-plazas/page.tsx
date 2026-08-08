'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { SearchInput } from '../../../components/ui/search-input';
import { useDebounce } from '../../../hooks/use-debounce';
import { CreatePlazaModal } from '../../../features/tolls/create-plaza-modal';
import { UpdatePlazaModal } from '../../../features/tolls/update-plaza-modal';
import { listTollPlazas } from '../../../lib/api/tolls.api';
import type { TollPlazaEntity } from '../../../types/entities';
import { formatCurrency } from '../../../utils/format';

const PAGE_SIZE = 20;

export default function TollPlazasPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPlaza, setEditingPlaza] = useState<TollPlazaEntity | null>(null);
  const debouncedSearch = useDebounce(search);

  const query = useQuery({
    queryKey: ['toll-plazas', { page, search: debouncedSearch }],
    queryFn: ({ signal }) =>
      listTollPlazas({ page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined }, signal),
  });

  const missingPriceCount = query.data?.items.filter((p) => p.pricePerAxle === null).length ?? 0;

  const columns = useMemo<ColumnDef<TollPlazaEntity, unknown>[]>(
    () => [
      { header: 'Nome', accessorFn: (row) => row.name },
      { header: 'Concessionária', accessorFn: (row) => row.operator },
      { header: 'Rodovia', accessorFn: (row) => row.highway ?? '-' },
      {
        header: 'Cidade/UF',
        cell: ({ row }) =>
          row.original.city ? `${row.original.city}/${row.original.state ?? ''}` : '-',
      },
      {
        header: 'Tarifa por eixo',
        cell: ({ row }) =>
          row.original.pricePerAxle === null ? (
            <Badge tone="warning" dot>
              <AlertTriangle size={11} />
              Não cadastrada
            </Badge>
          ) : (
            <span className="font-medium text-ink">
              {formatCurrency(row.original.pricePerAxle)}
            </span>
          ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Praças de pedágio"
        description="Cadastro global de praças e tarifa por eixo, usada na conferência automática de pedágio."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Nova praça
          </Button>
        }
      />

      {missingPriceCount > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-warning-200 bg-warning-50 px-3 py-2.5 text-sm text-warning-700">
          <AlertTriangle size={16} className="shrink-0" />
          {missingPriceCount} praça(s) nesta página sem tarifa cadastrada — pedágios registrados
          nelas aparecerão como &quot;não foi possível conferir&quot; no dashboard.
        </div>
      )}

      <FilterBar
        hasActiveFilters={Boolean(search)}
        onClear={() => {
          setSearch('');
          setPage(1);
        }}
      >
        <FormField label="Buscar" htmlFor="plaza-search" className="w-full sm:w-64">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Nome, concessionária, rodovia, cidade..."
          />
        </FormField>
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={query.data?.items ?? []}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => query.refetch()}
          onRowClick={(plaza) => setEditingPlaza(plaza)}
          getRowId={(p) => p.id}
          emptyTitle="Nenhuma praça encontrada"
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreatePlazaModal open={createOpen} onClose={() => setCreateOpen(false)} />
      {editingPlaza && (
        <UpdatePlazaModal
          open={Boolean(editingPlaza)}
          onClose={() => setEditingPlaza(null)}
          plaza={editingPlaza}
        />
      )}
    </div>
  );
}
