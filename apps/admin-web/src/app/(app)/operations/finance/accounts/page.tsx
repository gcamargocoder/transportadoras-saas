'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Landmark, Plus, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '../../../../../components/ui/badge';
import { Button } from '../../../../../components/ui/button';
import { DataTable } from '../../../../../components/ui/data-table';
import { ErrorState } from '../../../../../components/ui/error-state';
import { FilterBar } from '../../../../../components/ui/filter-bar';
import { FormField } from '../../../../../components/ui/form-field';
import { PageHeader } from '../../../../../components/ui/page-header';
import { Pagination } from '../../../../../components/ui/pagination';
import { Select } from '../../../../../components/ui/select';
import { SkeletonCards } from '../../../../../components/ui/skeleton';
import { StatCard } from '../../../../../components/ui/stat-card';
import { CreateAccountModal } from '../../../../../features/finance-accounts/create-account-modal';
import { useAuth } from '../../../../../hooks/use-auth';
import { getFinancialAccountsDashboard, listFinancialAccounts } from '../../../../../lib/api/finance-accounts.api';
import { FINANCIAL_ACCOUNT_WRITE_ROLES, hasRole } from '../../../../../lib/auth/roles';
import { FINANCIAL_ACCOUNT_TYPE_LABELS } from '../../../../../lib/labels';
import type { FinancialAccountEntity } from '../../../../../types/entities';
import type { FinancialAccountType } from '../../../../../types/enums';
import { formatCurrency } from '../../../../../utils/format';

const PAGE_SIZE = 20;
const TYPES: FinancialAccountType[] = ['BANK', 'CASH'];

// Fase 78 -- primeira camada estrutural de contas financeiras. Saldo
// projetado (Fase 74, /finance/cash-flow) e saldo real destas contas
// permanecem SEPARADOS de proposito (nunca fundidos numa mesma metrica --
// ver docs/financial-accounts.md).
export default function FinancialAccountsPage(): JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [type, setType] = useState<FinancialAccountType | ''>('');
  const [isActive, setIsActive] = useState<'' | 'true' | 'false'>('');
  const [createOpen, setCreateOpen] = useState(false);

  const filters = {
    type: type || undefined,
    isActive: isActive === '' ? undefined : isActive === 'true',
  };
  const hasActiveFilters = Boolean(type || isActive);

  const dashboardQuery = useQuery({
    queryKey: ['finance-accounts', 'dashboard'],
    queryFn: () => getFinancialAccountsDashboard(),
  });

  const listQuery = useQuery({
    queryKey: ['finance-accounts', 'list', { page, ...filters }],
    queryFn: () => listFinancialAccounts({ page, pageSize: PAGE_SIZE, ...filters }),
  });

  const canWrite = hasRole(user?.role, FINANCIAL_ACCOUNT_WRITE_ROLES);

  const columns: ColumnDef<FinancialAccountEntity, unknown>[] = [
    { header: 'Nome', cell: ({ row }) => row.original.name },
    { header: 'Tipo', cell: ({ row }) => FINANCIAL_ACCOUNT_TYPE_LABELS[row.original.type] },
    { header: 'Saldo atual', cell: ({ row }) => formatCurrency(row.original.currentBalance) },
    {
      header: 'Status',
      cell: ({ row }) => <Badge tone={row.original.isActive ? 'success' : 'neutral'}>{row.original.isActive ? 'Ativa' : 'Inativa'}</Badge>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Contas financeiras"
        description="Contas bancárias e de caixa da transportadora, com saldo calculado a partir do saldo inicial e das movimentações registradas. Sem integração bancária -- nenhum extrato é importado automaticamente."
        actions={
          canWrite && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={14} />
              Nova conta
            </Button>
          )
        }
      />

      {dashboardQuery.isLoading && <SkeletonCards count={5} />}
      {dashboardQuery.isError && <ErrorState onRetry={() => dashboardQuery.refetch()} />}
      {dashboardQuery.data && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Saldo total" value={formatCurrency(dashboardQuery.data.totalBalance)} icon={Wallet} tone="brand" />
          <StatCard label="Saldo bancário" value={formatCurrency(dashboardQuery.data.totalBankBalance)} icon={Landmark} tone="info" />
          <StatCard label="Saldo em caixa" value={formatCurrency(dashboardQuery.data.totalCashBalance)} icon={Wallet} tone="success" />
          <StatCard label="Contas ativas" value={String(dashboardQuery.data.activeAccounts)} tone="success" />
          <StatCard label="Contas inativas" value={String(dashboardQuery.data.inactiveAccounts)} tone="warning" />
        </div>
      )}

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setType('');
          setIsActive('');
          setPage(1);
        }}
      >
        <FormField label="Tipo" htmlFor="accounts-type" className="w-full sm:w-40">
          <Select
            id="accounts-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as FinancialAccountType | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {FINANCIAL_ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Status" htmlFor="accounts-status" className="w-full sm:w-36">
          <Select
            id="accounts-status"
            value={isActive}
            onChange={(e) => {
              setIsActive(e.target.value as '' | 'true' | 'false');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            <option value="true">Ativas</option>
            <option value="false">Inativas</option>
          </Select>
        </FormField>
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <DataTable
          columns={columns}
          data={listQuery.data?.items ?? []}
          isLoading={listQuery.isLoading}
          isError={listQuery.isError}
          onRetry={() => listQuery.refetch()}
          onRowClick={(row) => router.push(`/operations/finance/accounts/${row.id}`)}
          getRowId={(a) => a.id}
          emptyTitle="Nenhuma conta financeira cadastrada"
          emptyDescription="Cadastre uma conta bancária ou de caixa para começar a registrar movimentações."
        />
        {listQuery.data && <Pagination meta={listQuery.data.meta} onPageChange={setPage} />}
      </div>

      <CreateAccountModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
