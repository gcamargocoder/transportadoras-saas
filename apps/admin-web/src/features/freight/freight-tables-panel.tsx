'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ListTree, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { DataTable } from '../../components/ui/data-table';
import { FilterBar } from '../../components/ui/filter-bar';
import { FormField } from '../../components/ui/form-field';
import { Pagination } from '../../components/ui/pagination';
import { Select } from '../../components/ui/select';
import { useAuth } from '../../hooks/use-auth';
import { listFreightTables } from '../../lib/api/freight.api';
import { FREIGHT_WRITE_ROLES, hasRole } from '../../lib/auth/roles';
import { FREIGHT_TABLE_STATUS_LABELS, FREIGHT_TABLE_STATUS_TONE, labelOrValue } from '../../lib/labels';
import type { FreightTableEntity } from '../../types/entities';
import type { FreightTableStatus } from '../../types/enums';
import { formatDate } from '../../utils/format';
import { FreightTableFormModal } from './freight-table-form-modal';

const PAGE_SIZE = 20;

export function FreightTablesPanel({
  onManageRules,
}: {
  onManageRules?: (table: FreightTableEntity) => void;
}): JSX.Element {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<FreightTableStatus | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<FreightTableEntity | null>(null);

  const filters = { status: status || undefined };
  const query = useQuery({
    queryKey: ['freight', 'tables', { page, ...filters }],
    queryFn: ({ signal }) => listFreightTables({ page, pageSize: PAGE_SIZE, ...filters }, signal),
  });

  const columns = useMemo<ColumnDef<FreightTableEntity, unknown>[]>(
    () => [
      { header: 'Código', accessorFn: (row) => row.code },
      { header: 'Nome', accessorFn: (row) => row.name },
      { header: 'Cliente', accessorFn: (row) => row.customerName ?? '—' },
      { header: 'Contrato', accessorFn: (row) => row.contractCode ?? '—' },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={FREIGHT_TABLE_STATUS_TONE[row.original.status]}>
            {FREIGHT_TABLE_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      { header: 'Vigência', cell: ({ row }) => `${formatDate(row.original.effectiveFrom)} — ${row.original.effectiveUntil ? formatDate(row.original.effectiveUntil) : 'indeterminado'}` },
      { header: 'Regras vigentes', accessorFn: (row) => `${row.activeRulesCount}/${row.rulesCount}` },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={() => onManageRules?.(row.original)}>
            <ListTree size={14} />
            Regras
          </Button>
        ),
      },
    ],
    [onManageRules],
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ink-subtle">Tabelas de frete por cliente (agrupam regras versionadas).</p>
        {hasRole(user?.role, FREIGHT_WRITE_ROLES) && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Nova tabela
          </Button>
        )}
      </div>

      <FilterBar
        hasActiveFilters={Boolean(status)}
        onClear={() => {
          setStatus('');
          setPage(1);
        }}
      >
        <FormField label="Status" htmlFor="table-filter-status" className="w-full sm:w-44">
          <Select
            id="table-filter-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as FreightTableStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(FREIGHT_TABLE_STATUS_LABELS) as FreightTableStatus[]).map((s) => (
              <option key={s} value={s}>
                {labelOrValue(FREIGHT_TABLE_STATUS_LABELS, s)}
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
          getRowId={(t) => t.id}
          {...(hasRole(user?.role, FREIGHT_WRITE_ROLES) ? { onRowClick: (t: FreightTableEntity) => setEditing(t) } : {})}
          emptyTitle="Nenhuma tabela de frete encontrada"
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <FreightTableFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <FreightTableFormModal open={editing !== null} onClose={() => setEditing(null)} table={editing} />
    </div>
  );
}
