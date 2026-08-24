'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, Clock, ListChecks, TriangleAlert, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { DataTable } from '../../../../../components/ui/data-table';
import { DatePicker } from '../../../../../components/ui/date-picker';
import { EntitySelect } from '../../../../../components/ui/entity-select';
import { ErrorState } from '../../../../../components/ui/error-state';
import { FilterBar } from '../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../components/ui/form-field';
import { PageHeader } from '../../../../../components/ui/page-header';
import { Pagination } from '../../../../../components/ui/pagination';
import { Select } from '../../../../../components/ui/select';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { BankTransactionDetailModal } from '../../../../../features/bank-reconciliation/bank-transaction-detail-modal';
import { ImportBankTransactionsModal } from '../../../../../features/bank-reconciliation/import-bank-transactions-modal';
import { useAuth } from '../../../../../hooks/use-auth';
import { getBankReconciliationDashboard, listBankTransactions } from '../../../../../lib/api/bank-reconciliation.api';
import { BANK_RECONCILIATION_WRITE_ROLES, hasRole } from '../../../../../lib/auth/roles';
import { listFinancialAccounts } from '../../../../../lib/api/finance-accounts.api';
import {
  FINANCIAL_BANK_TRANSACTION_STATUS_LABELS,
  FINANCIAL_BANK_TRANSACTION_STATUS_TONE,
  FINANCIAL_TRANSACTION_TYPE_LABELS,
} from '../../../../../lib/labels';
import type { BankTransactionEntity } from '../../../../../types/entities';
import type { FinancialBankTransactionStatus, FinancialTransactionType } from '../../../../../types/enums';
import { formatCurrency, formatDate } from '../../../../../utils/format';

const PAGE_SIZE = 20;
const STATUS_OPTIONS: FinancialBankTransactionStatus[] = ['PENDING', 'MATCHED', 'DIVERGENT'];
const TYPE_OPTIONS: FinancialTransactionType[] = ['CREDIT', 'DEBIT'];

// Fase 80 -- conciliacao bancaria: CSV -> BankTransaction -> conciliacao
// manual com FinancialTransaction. Saldo oficial NUNCA e calculado aqui
// (ver /operations/finance/accounts, Fase 78) -- esta tela so mostra
// contagens/somas das proprias movimentacoes importadas.
export default function BankReconciliationPage(): JSX.Element {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [financialAccountId, setFinancialAccountId] = useState('');
  const [status, setStatus] = useState<FinancialBankTransactionStatus | ''>('');
  const [type, setType] = useState<FinancialTransactionType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filters = {
    financialAccountId: financialAccountId || undefined,
    status: status || undefined,
    type: type || undefined,
    from: from || undefined,
    to: to || undefined,
  };
  const hasActiveFilters = Boolean(financialAccountId || status || type || from || to);

  const dashboardQuery = useQuery({
    queryKey: ['bank-transactions', 'dashboard', filters],
    queryFn: () => getBankReconciliationDashboard(filters),
  });

  const listQuery = useQuery({
    queryKey: ['bank-transactions', 'list', { page, ...filters }],
    queryFn: () => listBankTransactions({ page, pageSize: PAGE_SIZE, ...filters }),
  });

  const canWrite = hasRole(user?.role, BANK_RECONCILIATION_WRITE_ROLES);

  const columns: ColumnDef<BankTransactionEntity, unknown>[] = [
    { header: 'Data', cell: ({ row }) => formatDate(row.original.date) },
    { header: 'Descrição', cell: ({ row }) => row.original.description },
    { header: 'Valor', cell: ({ row }) => formatCurrency(row.original.amount) },
    {
      header: 'Tipo',
      cell: ({ row }) => (
        <Badge tone={row.original.type === 'CREDIT' ? 'success' : 'danger'}>{FINANCIAL_TRANSACTION_TYPE_LABELS[row.original.type]}</Badge>
      ),
    },
    { header: 'Conta', cell: ({ row }) => row.original.financialAccountName ?? '—' },
    {
      header: 'Status',
      cell: ({ row }) => (
        <Badge tone={FINANCIAL_BANK_TRANSACTION_STATUS_TONE[row.original.status]}>
          {FINANCIAL_BANK_TRANSACTION_STATUS_LABELS[row.original.status]}
        </Badge>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Conciliação bancária"
        description="Movimentações externas importadas de extrato CSV, conferidas manualmente contra o ledger interno (FinancialTransaction). Importar nunca cria movimentação no ledger -- só a conciliação vincula os dois lados, sempre por ação manual."
        actions={
          canWrite && (
            <Button onClick={() => setImportOpen(true)}>
              <UploadCloud size={14} />
              Importar extrato
            </Button>
          )
        }
      />

      {dashboardQuery.isLoading && <SkeletonCards count={4} />}
      {dashboardQuery.isError && <ErrorState onRetry={() => dashboardQuery.refetch()} />}
      {dashboardQuery.data && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total de movimentações" value={String(dashboardQuery.data.totalCount)} icon={ListChecks} tone="brand" />
          <StatCard
            label="Conciliadas"
            value={`${dashboardQuery.data.matchedCount} · ${formatCurrency(dashboardQuery.data.matchedAmount)}`}
            icon={CheckCircle2}
            tone="success"
          />
          <StatCard
            label="Pendentes"
            value={`${dashboardQuery.data.pendingCount} · ${formatCurrency(dashboardQuery.data.pendingAmount)}`}
            icon={Clock}
            tone="info"
          />
          <StatCard
            label="Divergentes"
            value={`${dashboardQuery.data.divergentCount} · ${formatCurrency(dashboardQuery.data.divergentAmount)}`}
            icon={TriangleAlert}
            tone="warning"
          />
        </div>
      )}

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setFinancialAccountId('');
          setStatus('');
          setType('');
          setFrom('');
          setTo('');
          setPage(1);
        }}
      >
        <FormField label="Conta" htmlFor="bank-filter-account" className="w-full sm:w-48">
          <EntitySelect
            id="bank-filter-account"
            queryKey={['finance-accounts', 'list', 'filter-select']}
            queryFn={() => listFinancialAccounts({ pageSize: 100 })}
            getOptionValue={(a) => a.id}
            getOptionLabel={(a) => a.name}
            value={financialAccountId}
            onChange={(value) => {
              setFinancialAccountId(value);
              setPage(1);
            }}
            placeholder="Todas"
          />
        </FormField>
        <FormField label="Status" htmlFor="bank-filter-status" className="w-full sm:w-36">
          <Select
            id="bank-filter-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as FinancialBankTransactionStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {FINANCIAL_BANK_TRANSACTION_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Tipo" htmlFor="bank-filter-type" className="w-full sm:w-36">
          <Select
            id="bank-filter-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as FinancialTransactionType | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {FINANCIAL_TRANSACTION_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="De" htmlFor="bank-filter-from" className="w-full sm:w-40">
          <DatePicker
            id="bank-filter-from"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Até" htmlFor="bank-filter-to" className="w-full sm:w-40">
          <DatePicker
            id="bank-filter-to"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
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
          onRowClick={(row) => setSelectedId(row.id)}
          getRowId={(t) => t.id}
          emptyTitle="Nenhuma movimentação bancária encontrada"
          emptyDescription="Importe um extrato CSV ou ajuste os filtros."
        />
        {listQuery.data && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
      </div>

      <ImportBankTransactionsModal open={importOpen} onClose={() => setImportOpen(false)} />
      <BankTransactionDetailModal open={selectedId !== null} onClose={() => setSelectedId(null)} bankTransactionId={selectedId} />
    </div>
  );
}
