'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Plus, Receipt, UploadCloud } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { DatePicker } from '../../../components/ui/date-picker';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { PageHeader } from '../../../components/ui/page-header';
import { Pagination } from '../../../components/ui/pagination';
import { Select } from '../../../components/ui/select';
import { SkeletonCards } from '../../../components/ui/skeleton';
import { StatCard } from '../../../components/ui/stat-card';
import { useAuth } from '../../../hooks/use-auth';
import { getTollDashboard, listTollTransactions } from '../../../lib/api/tolls.api';
import { hasRole, TOLL_IMPORT_WRITE_ROLES, TOLL_WRITE_ROLES } from '../../../lib/auth/roles';
import { TOLL_STATUS_LABELS } from '../../../lib/labels';
import { TOLL_STATUS_TONE } from '../../../features/tolls/status';
import { CreateTollModal } from '../../../features/tolls/create-toll-modal';
import { ImportStatementModal } from '../../../features/tolls/import-statement-modal';
import type { TollTransactionEntity } from '../../../types/entities';
import type { TollTransactionStatus } from '../../../types/enums';
import { formatCurrency, formatDateTime } from '../../../utils/format';

const PAGE_SIZE = 20;

export default function TollsPage(): JSX.Element {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<TollTransactionStatus | ''>('');
  const [chargedFrom, setChargedFrom] = useState('');
  const [chargedTo, setChargedTo] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const filters = {
    status: status || undefined,
    chargedFrom: chargedFrom || undefined,
    chargedTo: chargedTo || undefined,
  };

  const dashboardQuery = useQuery({
    queryKey: ['toll-transactions', 'dashboard', filters],
    queryFn: ({ signal }) => getTollDashboard(filters, signal),
  });

  const listQuery = useQuery({
    queryKey: ['toll-transactions', 'list', { page, ...filters }],
    queryFn: ({ signal }) =>
      listTollTransactions({ page, pageSize: PAGE_SIZE, ...filters }, signal),
  });

  const columns = useMemo<ColumnDef<TollTransactionEntity, unknown>[]>(
    () => [
      { header: 'Praça', accessorFn: (row) => row.tollPlazaName },
      { header: 'Veículo', accessorFn: (row) => row.vehiclePlate ?? '-' },
      { header: 'Motorista', accessorFn: (row) => row.driverName ?? '-' },
      { header: 'Data', cell: ({ row }) => formatDateTime(row.original.chargedAt) },
      { header: 'Cobrado', cell: ({ row }) => formatCurrency(row.original.chargedAmount) },
      { header: 'Esperado', cell: ({ row }) => formatCurrency(row.original.expectedAmount) },
      {
        header: 'Divergência',
        cell: ({ row }) => {
          const value = row.original.discrepancyAmount;
          if (Math.abs(value) < 0.01) return <span className="text-ink-subtle">-</span>;
          return (
            <span
              className={value > 0 ? 'font-medium text-danger-600' : 'font-medium text-warning-600'}
            >
              {value > 0 ? '+' : ''}
              {formatCurrency(value)}
            </span>
          );
        },
      },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge
            tone={TOLL_STATUS_TONE[row.original.status]}
            dot={row.original.status === 'DIVERGENT'}
          >
            {TOLL_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
    ],
    [],
  );

  const hasActiveFilters = Boolean(status || chargedFrom || chargedTo);

  return (
    <div>
      <PageHeader
        title="Pedágios"
        description="Transações de pedágio e divergências entre valor cobrado e esperado."
        actions={
          <>
            {hasRole(user?.role, TOLL_IMPORT_WRITE_ROLES) && (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <UploadCloud size={16} />
                Importar extrato
              </Button>
            )}
            {hasRole(user?.role, TOLL_WRITE_ROLES) && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={16} />
                Registrar pedágio
              </Button>
            )}
          </>
        }
      />

      {dashboardQuery.isLoading && <SkeletonCards />}
      {dashboardQuery.data && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Transações"
            value={String(dashboardQuery.data.totalCount)}
            icon={Receipt}
          />
          <StatCard
            label="Total cobrado"
            value={formatCurrency(dashboardQuery.data.totalChargedAmount)}
          />
          <StatCard
            label="Total esperado"
            value={formatCurrency(dashboardQuery.data.totalExpectedAmount)}
          />
          <StatCard
            label="Divergência total"
            value={formatCurrency(dashboardQuery.data.totalDiscrepancyAmount)}
            icon={AlertTriangle}
            tone={
              Math.abs(dashboardQuery.data.totalDiscrepancyAmount) < 0.01 ? 'success' : 'danger'
            }
          />
        </div>
      )}

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setStatus('');
          setChargedFrom('');
          setChargedTo('');
          setPage(1);
        }}
      >
        <FormField label="Status" htmlFor="toll-status" className="w-full sm:w-48">
          <Select
            id="toll-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as TollTransactionStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {(Object.keys(TOLL_STATUS_LABELS) as TollTransactionStatus[]).map((s) => (
              <option key={s} value={s}>
                {TOLL_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="De" htmlFor="toll-from" className="w-full sm:w-40">
          <DatePicker
            id="toll-from"
            value={chargedFrom}
            onChange={(e) => {
              setChargedFrom(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Até" htmlFor="toll-to" className="w-full sm:w-40">
          <DatePicker
            id="toll-to"
            value={chargedTo}
            onChange={(e) => {
              setChargedTo(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={listQuery.data?.items ?? []}
          isLoading={listQuery.isLoading}
          isError={listQuery.isError}
          onRetry={() => listQuery.refetch()}
          getRowId={(t) => t.id}
          emptyTitle="Nenhum pedágio encontrado"
          emptyDescription="Não existem transações de pedágio para os filtros selecionados."
        />
        {listQuery.data && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
      </div>

      <CreateTollModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ImportStatementModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
