'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { DataTable } from '../../../../../components/ui/data-table';
import { FilterBar } from '../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../components/ui/form-field';
import { PageHeader } from '../../../../../components/ui/page-header';
import { Pagination } from '../../../../../components/ui/pagination';
import { Select } from '../../../../../components/ui/select';
import { CreatePeriodModal } from '../../../../../features/financial-periods/create-period-modal';
import { PeriodDetailModal } from '../../../../../features/financial-periods/period-detail-modal';
import { useAuth } from '../../../../../hooks/use-auth';
import { listFinancialPeriods } from '../../../../../lib/api/financial-periods.api';
import { FINANCIAL_PERIOD_WRITE_ROLES, hasRole } from '../../../../../lib/auth/roles';
import { FINANCIAL_PERIOD_STATUS_LABELS, FINANCIAL_PERIOD_STATUS_TONE, MONTH_LABELS } from '../../../../../lib/labels';
import type { FinancialPeriodEntity } from '../../../../../types/entities';
import type { FinancialPeriodStatus } from '../../../../../types/enums';
import { formatDateTime } from '../../../../../utils/format';

const PAGE_SIZE = 20;
const STATUS_OPTIONS: FinancialPeriodStatus[] = ['OPEN', 'CLOSED'];

export default function FinancialPeriodsPage(): JSX.Element {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<FinancialPeriodStatus | ''>('');
  const [year, setYear] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filters = {
    status: status || undefined,
    year: year ? Number(year) : undefined,
  };
  const hasActiveFilters = Boolean(status || year);

  const query = useQuery({
    queryKey: ['financial-periods', 'list', { page, ...filters }],
    queryFn: () => listFinancialPeriods({ page, pageSize: PAGE_SIZE, ...filters }),
  });

  const canWrite = hasRole(user?.role, FINANCIAL_PERIOD_WRITE_ROLES);

  const columns: ColumnDef<FinancialPeriodEntity, unknown>[] = [
    { header: 'Período', cell: ({ row }) => `${MONTH_LABELS[row.original.month]} de ${row.original.year}` },
    {
      header: 'Status',
      cell: ({ row }) => (
        <Badge tone={FINANCIAL_PERIOD_STATUS_TONE[row.original.status]}>
          {FINANCIAL_PERIOD_STATUS_LABELS[row.original.status]}
        </Badge>
      ),
    },
    {
      header: 'Aberto em',
      cell: ({ row }) => `${formatDateTime(row.original.openedAt)} · ${row.original.openerName ?? '—'}`,
    },
    {
      header: 'Fechado em',
      cell: ({ row }) =>
        row.original.closedAt ? `${formatDateTime(row.original.closedAt)} · ${row.original.closerName ?? '—'}` : '—',
    },
    {
      header: 'Ações',
      cell: ({ row }) => (
        <Button size="sm" variant="outline" onClick={() => setSelectedId(row.original.id)}>
          Ver
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Períodos financeiros"
        description="Controle de fechamento por competência (YYYY-MM) sobre os títulos e pagamentos já existentes -- fechar um período bloqueia novos lançamentos com data de competência naquele mês, sem alterar nenhum dado histórico."
        actions={
          canWrite && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={14} />
              Abrir período
            </Button>
          )
        }
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setStatus('');
          setYear('');
          setPage(1);
        }}
      >
        <FormField label="Ano" htmlFor="periods-year" className="w-full sm:w-32">
          <Select
            id="periods-year"
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Status" htmlFor="periods-status" className="w-full sm:w-40">
          <Select
            id="periods-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as FinancialPeriodStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {FINANCIAL_PERIOD_STATUS_LABELS[s]}
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
          getRowId={(p) => p.id}
          emptyTitle="Nenhum período financeiro encontrado"
          emptyDescription="Abra um período para começar a controlar o fechamento mensal."
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreatePeriodModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <PeriodDetailModal open={selectedId !== null} onClose={() => setSelectedId(null)} periodId={selectedId} />
    </div>
  );
}
