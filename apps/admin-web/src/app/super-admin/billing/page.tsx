'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Clock, DollarSign, Plus, TrendingUp, TriangleAlert } from 'lucide-react';
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
import { SkeletonCards } from '../../../components/ui/skeleton';
import { StatCard } from '../../../components/ui/stat-card';
import { useDebounce } from '../../../hooks/use-debounce';
import { CreateSubscriptionModal } from '../../../features/billing/create-subscription-modal';
import { RegisterPaymentModal } from '../../../features/billing/register-payment-modal';
import { getBillingDashboard, listSubscriptions } from '../../../lib/api/billing.api';
import {
  SUBSCRIPTION_PAYMENT_METHOD_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TONE,
  TENANT_PLAN_TIER_LABELS,
} from '../../../lib/labels';
import type { SubscriptionEntity } from '../../../types/entities';
import type { SubscriptionPaymentMethod, SubscriptionStatus, TenantPlanTier } from '../../../types/enums';
import { formatCurrency, formatDate } from '../../../utils/format';

const PAGE_SIZE = 20;
const ALL_STATUSES = Object.keys(SUBSCRIPTION_STATUS_LABELS) as SubscriptionStatus[];
const ALL_METHODS = Object.keys(SUBSCRIPTION_PAYMENT_METHOD_LABELS) as SubscriptionPaymentMethod[];
const ALL_TIERS = Object.keys(TENANT_PLAN_TIER_LABELS) as TenantPlanTier[];

export default function SuperAdminBillingPage(): JSX.Element {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SubscriptionStatus | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<SubscriptionPaymentMethod | ''>('');
  const [planTier, setPlanTier] = useState<TenantPlanTier | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<SubscriptionEntity | null>(null);
  const debouncedSearch = useDebounce(search);

  const dashboardQuery = useQuery({
    queryKey: ['super-admin', 'billing', 'dashboard'],
    queryFn: ({ signal }) => getBillingDashboard({}, signal),
  });

  const query = useQuery({
    queryKey: [
      'super-admin',
      'billing',
      'subscriptions',
      { page, search: debouncedSearch, status, paymentMethod, planTier },
    ],
    queryFn: ({ signal }) =>
      listSubscriptions(
        {
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          status: status || undefined,
          paymentMethod: paymentMethod || undefined,
          planTier: planTier || undefined,
        },
        signal,
      ),
  });

  const columns = useMemo<ColumnDef<SubscriptionEntity, unknown>[]>(
    () => [
      {
        header: 'Transportadora',
        cell: ({ row }) => <p className="font-medium text-ink">{row.original.tenantName}</p>,
      },
      { header: 'Plano', accessorFn: (row) => TENANT_PLAN_TIER_LABELS[row.planTier] },
      { header: 'Valor', accessorFn: (row) => formatCurrency(row.amount) },
      {
        header: 'Vencimento',
        cell: ({ row }) => (
          <div>
            <p>{formatDate(row.original.nextDueDate)}</p>
            {row.original.daysOverdue > 0 && (
              <p className="text-xs text-danger-600">{row.original.daysOverdue} dia(s) em atraso</p>
            )}
          </div>
        ),
      },
      { header: 'Método', accessorFn: (row) => SUBSCRIPTION_PAYMENT_METHOD_LABELS[row.paymentMethod] },
      {
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={SUBSCRIPTION_STATUS_TONE[row.original.status]}>
            {SUBSCRIPTION_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setPaymentTarget(row.original);
            }}
          >
            Registrar pagamento
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Cobrança"
        description="Assinaturas e pagamentos manuais das transportadoras."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
            Nova assinatura
          </Button>
        }
      />

      {dashboardQuery.isLoading && <SkeletonCards count={4} />}
      {dashboardQuery.data && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Recebido no período"
            value={formatCurrency(dashboardQuery.data.receivedInPeriod)}
            icon={DollarSign}
            tone="success"
          />
          <StatCard
            label="Pendente"
            value={formatCurrency(dashboardQuery.data.pendingAmount)}
            icon={Clock}
            tone="info"
          />
          <StatCard
            label="Em atraso"
            value={formatCurrency(dashboardQuery.data.overdueAmount)}
            icon={TriangleAlert}
            tone="danger"
          />
          <StatCard
            label="Previsão mensal"
            value={formatCurrency(dashboardQuery.data.monthlyProjectedRevenue)}
            icon={TrendingUp}
            tone="brand"
          />
        </div>
      )}

      <FilterBar
        hasActiveFilters={Boolean(search || status || paymentMethod || planTier)}
        onClear={() => {
          setSearch('');
          setStatus('');
          setPaymentMethod('');
          setPlanTier('');
          setPage(1);
        }}
      >
        <FormField label="Buscar" htmlFor="subscription-search" className="w-full sm:w-64">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Transportadora..."
          />
        </FormField>
        <FormField label="Status" htmlFor="subscription-status" className="w-full sm:w-44">
          <Select
            id="subscription-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as SubscriptionStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SUBSCRIPTION_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Método" htmlFor="subscription-method" className="w-full sm:w-44">
          <Select
            id="subscription-method"
            value={paymentMethod}
            onChange={(e) => {
              setPaymentMethod(e.target.value as SubscriptionPaymentMethod | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {ALL_METHODS.map((m) => (
              <option key={m} value={m}>
                {SUBSCRIPTION_PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Plano" htmlFor="subscription-plan" className="w-full sm:w-44">
          <Select
            id="subscription-plan"
            value={planTier}
            onChange={(e) => {
              setPlanTier(e.target.value as TenantPlanTier | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {ALL_TIERS.map((t) => (
              <option key={t} value={t}>
                {TENANT_PLAN_TIER_LABELS[t]}
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
          onRowClick={(subscription) => router.push(`/super-admin/tenants/${subscription.tenantId}`)}
          getRowId={(subscription) => subscription.id}
          emptyTitle="Nenhuma assinatura encontrada"
          emptyDescription="Não existem assinaturas para os filtros selecionados."
        />
        {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
      </div>

      <CreateSubscriptionModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <RegisterPaymentModal
        subscription={paymentTarget}
        onClose={() => setPaymentTarget(null)}
      />
    </div>
  );
}
