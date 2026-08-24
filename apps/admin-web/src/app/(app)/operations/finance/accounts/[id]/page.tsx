'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeftRight, Ban, CheckCircle2, Plus } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '../../../../../../components/ui/badge';
import { Button } from '../../../../../../components/ui/button';
import { ConfirmDialog } from '../../../../../../components/ui/confirm-dialog';
import { DataTable } from '../../../../../../components/ui/data-table';
import { DatePicker } from '../../../../../../components/ui/date-picker';
import { ErrorState } from '../../../../../../components/ui/error-state';
import { FilterBar } from '../../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../../components/ui/form-field';
import { LoadingState } from '../../../../../../components/ui/loading-state';
import { PageHeader } from '../../../../../../components/ui/page-header';
import { Pagination } from '../../../../../../components/ui/pagination';
import { Select } from '../../../../../../components/ui/select';
import { StatCard } from '../../../../../../components/ui/stat-card';
import { useToast } from '../../../../../../components/ui/toast';
import { NewTransactionModal } from '../../../../../../features/finance-accounts/new-transaction-modal';
import { TransferModal } from '../../../../../../features/finance-accounts/transfer-modal';
import { useAuth } from '../../../../../../hooks/use-auth';
import { toFriendlyMessage } from '../../../../../../lib/api/errors';
import {
  activateFinancialAccount,
  deactivateFinancialAccount,
  getFinancialAccount,
  listFinancialTransactions,
} from '../../../../../../lib/api/finance-accounts.api';
import { FINANCIAL_ACCOUNT_WRITE_ROLES, hasRole } from '../../../../../../lib/auth/roles';
import { FINANCIAL_ACCOUNT_TYPE_LABELS, FINANCIAL_TRANSACTION_TYPE_LABELS } from '../../../../../../lib/labels';
import type { FinancialTransactionEntity } from '../../../../../../types/entities';
import type { FinancialTransactionType } from '../../../../../../types/enums';
import { formatCurrency, formatDateTime } from '../../../../../../utils/format';

const PAGE_SIZE = 20;
const TYPES: FinancialTransactionType[] = ['CREDIT', 'DEBIT'];

export default function FinancialAccountDetailPage(): JSX.Element {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const accountId = params.id;
  const queryClient = useQueryClient();
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [type, setType] = useState<FinancialTransactionType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [newTransactionOpen, setNewTransactionOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);

  const accountQuery = useQuery({
    queryKey: ['finance-accounts', accountId],
    queryFn: () => getFinancialAccount(accountId),
  });

  const filters = { type: type || undefined, from: from || undefined, to: to || undefined };
  const hasActiveFilters = Boolean(type || from || to);

  const transactionsQuery = useQuery({
    queryKey: ['finance-accounts', accountId, 'transactions', { page, ...filters }],
    queryFn: () => listFinancialTransactions(accountId, { page, pageSize: PAGE_SIZE, ...filters }),
    enabled: Boolean(accountId),
  });

  const toggleMutation = useMutation({
    mutationFn: () => (account?.isActive ? deactivateFinancialAccount(accountId) : activateFinancialAccount(accountId)),
    onSuccess: () => {
      toast.success(account?.isActive ? 'Conta desativada.' : 'Conta reativada.');
      queryClient.invalidateQueries({ queryKey: ['finance-accounts'] });
      setToggleOpen(false);
    },
    onError: (error) => {
      toast.error('Não foi possível atualizar o status da conta.', toFriendlyMessage(error));
      setToggleOpen(false);
    },
  });

  const canWrite = hasRole(user?.role, FINANCIAL_ACCOUNT_WRITE_ROLES);
  const account = accountQuery.data;

  if (accountQuery.isLoading) return <LoadingState label="Carregando conta" />;
  if (accountQuery.isError || !account) return <ErrorState onRetry={() => accountQuery.refetch()} />;

  const columns: ColumnDef<FinancialTransactionEntity, unknown>[] = [
    { header: 'Data', cell: ({ row }) => formatDateTime(row.original.transactionDate) },
    {
      header: 'Tipo',
      cell: ({ row }) => (
        <Badge tone={row.original.type === 'CREDIT' ? 'success' : 'danger'}>
          {FINANCIAL_TRANSACTION_TYPE_LABELS[row.original.type]}
        </Badge>
      ),
    },
    { header: 'Valor', cell: ({ row }) => formatCurrency(row.original.amount) },
    { header: 'Descrição', cell: ({ row }) => row.original.description },
    {
      // Fase 79, secao 16 -- origem da movimentacao. Nao ha rota dedicada
      // para abrir um Receivable/Payable especifico (a UI so tem modal
      // aberto a partir da listagem) -- por isso mostra apenas o rotulo +
      // referencia, nunca um link inventado (ver docs/financial-payment-integration.md).
      header: 'Origem',
      cell: ({ row }) => {
        const { referenceType, referenceId } = row.original;
        if (referenceType === 'ReceivablePayment') return <Badge tone="info">Recebimento</Badge>;
        if (referenceType === 'PayablePayment') return <Badge tone="warning">Pagamento</Badge>;
        if (referenceType === 'FinancialTransfer') return <Badge tone="neutral">Transferência</Badge>;
        return referenceId ? <span className="font-mono text-xs text-ink-subtle">{referenceId}</span> : '—';
      },
    },
    { header: 'Registrado por', cell: ({ row }) => row.original.creatorName ?? '—' },
  ];

  return (
    <div>
      <PageHeader
        title={account.name}
        description={`${FINANCIAL_ACCOUNT_TYPE_LABELS[account.type]}${account.bankName ? ` · ${account.bankName}` : ''}`}
        breadcrumb={[{ label: 'Contas financeiras', href: '/operations/finance/accounts' }, { label: account.name }]}
        actions={
          canWrite && (
            <>
              <Button variant="outline" onClick={() => setTransferOpen(true)} disabled={!account.isActive}>
                <ArrowLeftRight size={14} />
                Transferir
              </Button>
              <Button onClick={() => setNewTransactionOpen(true)} disabled={!account.isActive}>
                <Plus size={14} />
                Nova movimentação
              </Button>
              <Button variant={account.isActive ? 'danger' : 'outline'} onClick={() => setToggleOpen(true)}>
                {account.isActive ? <Ban size={14} /> : <CheckCircle2 size={14} />}
                {account.isActive ? 'Desativar' : 'Reativar'}
              </Button>
            </>
          )
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Saldo atual" value={formatCurrency(account.currentBalance)} tone="brand" />
        <StatCard label="Saldo inicial" value={formatCurrency(account.initialBalance)} tone="info" />
        <StatCard label="Status" value={account.isActive ? 'Ativa' : 'Inativa'} tone={account.isActive ? 'success' : 'danger'} />
      </div>

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setType('');
          setFrom('');
          setTo('');
          setPage(1);
        }}
      >
        <FormField label="Tipo" htmlFor="tx-filter-type" className="w-full sm:w-40">
          <Select
            id="tx-filter-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as FinancialTransactionType | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {FINANCIAL_TRANSACTION_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="De" htmlFor="tx-filter-from" className="w-full sm:w-40">
          <DatePicker
            id="tx-filter-from"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Até" htmlFor="tx-filter-to" className="w-full sm:w-40">
          <DatePicker
            id="tx-filter-to"
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
          data={transactionsQuery.data?.items ?? []}
          isLoading={transactionsQuery.isLoading}
          isError={transactionsQuery.isError}
          onRetry={() => transactionsQuery.refetch()}
          getRowId={(t) => t.id}
          emptyTitle="Nenhuma movimentação encontrada"
          emptyDescription="Registre uma movimentação manual ou ajuste os filtros."
        />
        {transactionsQuery.data && <Pagination meta={transactionsQuery.data.meta} onPageChange={setPage} />}
      </div>

      <NewTransactionModal open={newTransactionOpen} onClose={() => setNewTransactionOpen(false)} accountId={accountId} />
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} sourceAccountId={accountId} />
      <ConfirmDialog
        open={toggleOpen}
        onClose={() => setToggleOpen(false)}
        onConfirm={() => toggleMutation.mutate()}
        title={account.isActive ? 'Desativar conta' : 'Reativar conta'}
        description={
          account.isActive
            ? 'Bloqueia novas movimentações e transferências nesta conta. O histórico é preservado.'
            : 'A conta volta a aceitar movimentações e transferências.'
        }
        confirmLabel={account.isActive ? 'Desativar' : 'Reativar'}
        danger={account.isActive}
        loading={toggleMutation.isPending}
      />
    </div>
  );
}
