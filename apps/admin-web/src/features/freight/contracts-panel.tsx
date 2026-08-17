'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { DataTable } from '../../components/ui/data-table';
import { FilterBar } from '../../components/ui/filter-bar';
import { FormField } from '../../components/ui/form-field';
import { Pagination } from '../../components/ui/pagination';
import { Select } from '../../components/ui/select';
import { useAuth } from '../../hooks/use-auth';
import { listContracts } from '../../lib/api/freight.api';
import { FREIGHT_WRITE_ROLES, hasRole } from '../../lib/auth/roles';
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_TONE, labelOrValue } from '../../lib/labels';
import type { ContractEntity } from '../../types/entities';
import type { ContractStatus } from '../../types/enums';
import { formatDate } from '../../utils/format';
import { ContractFormModal } from './contract-form-modal';

const PAGE_SIZE = 20;

export function ContractsPanel(): JSX.Element {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ContractStatus | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ContractEntity | null>(null);

  const filters = { status: status || undefined };
  const query = useQuery({
    queryKey: ['freight', 'contracts', { page, ...filters }],
    queryFn: ({ signal }) => listContracts({ page, pageSize: PAGE_SIZE, ...filters }, signal),
  });

  const columns = useMemo<ColumnDef<ContractEntity, unknown>[]>(
    () => [
      { header: 'Código', accessorFn: (row) => row.code },
      { header: 'Cliente', accessorFn: (row) => row.customerName ?? '—' },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={CONTRACT_STATUS_TONE[row.original.status]}>{CONTRACT_STATUS_LABELS[row.original.status]}</Badge>
        ),
      },
      { header: 'Início', cell: ({ row }) => formatDate(row.original.startDate) },
      {
        header: 'Fim',
        cell: ({ row }) =>
          row.original.endDate ? (
            <span className={row.original.isExpired ? 'text-danger-600' : undefined}>
              {formatDate(row.original.endDate)}
              {row.original.isExpired ? ' (vencido)' : ''}
            </span>
          ) : (
            '—'
          ),
      },
      { header: 'Tabelas', accessorFn: (row) => row.freightTablesCount },
    ],
    [],
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-ink-subtle">Contratos comerciais de frete por cliente.</p>
        {hasRole(user?.role, FREIGHT_WRITE_ROLES) && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Novo contrato
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
        <FormField label="Status" htmlFor="contract-filter-status" className="w-full sm:w-44">
          <Select
            id="contract-filter-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ContractStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(CONTRACT_STATUS_LABELS) as ContractStatus[]).map((s) => (
              <option key={s} value={s}>
                {labelOrValue(CONTRACT_STATUS_LABELS, s)}
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
          getRowId={(c) => c.id}
          {...(hasRole(user?.role, FREIGHT_WRITE_ROLES) ? { onRowClick: (c: ContractEntity) => setEditing(c) } : {})}
          emptyTitle="Nenhum contrato encontrado"
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <ContractFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ContractFormModal open={editing !== null} onClose={() => setEditing(null)} contract={editing} />
    </div>
  );
}
