'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, RefreshCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardHeader } from '../../../../components/ui/card';
import { ConfirmDialog } from '../../../../components/ui/confirm-dialog';
import { ErrorState } from '../../../../components/ui/error-state';
import { LoadingState } from '../../../../components/ui/loading-state';
import { PageHeader } from '../../../../components/ui/page-header';
import { StatCard } from '../../../../components/ui/stat-card';
import { useToast } from '../../../../components/ui/toast';
import { CustomerContactsCard } from '../../../../features/customers/customer-contacts-card';
import { CustomerFormModal } from '../../../../features/customers/customer-form-modal';
import { CustomerNotesCard } from '../../../../features/customers/customer-notes-card';
import { CompleteRenewalModal } from '../../../../features/freight/complete-renewal-modal';
import { ContractFormModal } from '../../../../features/freight/contract-form-modal';
import { FreightTableFormModal } from '../../../../features/freight/freight-table-form-modal';
import { InitiateRenewalModal } from '../../../../features/freight/initiate-renewal-modal';
import { TRIP_STATUS_TONE } from '../../../../features/trips/status';
import { getBillingDashboard, listTripBillings } from '../../../../lib/api/billing-operational.api';
import {
  cancelContractRenewal,
  getContractRenewalSummary,
  listContractRenewals,
} from '../../../../lib/api/contract-renewals.api';
import { toFriendlyMessage } from '../../../../lib/api/errors';
import { getCustomerProfitabilityForCustomer } from '../../../../lib/api/customer-profitability.api';
import { listContracts, listFreightTables, getFreightDashboard } from '../../../../lib/api/freight.api';
import { getReceivablesDashboard, listReceivables } from '../../../../lib/api/receivables.api';
import { getCustomer, getCustomerSummary, listTrips } from '../../../../lib/api/trips.api';
import { FREIGHT_WRITE_ROLES, TRIP_WRITE_ROLES, hasRole } from '../../../../lib/auth/roles';
import { useAuth } from '../../../../hooks/use-auth';
import {
  CONTRACT_RENEWAL_STATUS_LABELS,
  CONTRACT_RENEWAL_STATUS_TONE,
  RECEIVABLE_STATUS_LABELS,
  RECEIVABLE_STATUS_TONE,
  TRIP_BILLING_STATUS_LABELS,
  TRIP_BILLING_STATUS_TONE,
  TRIP_STATUS_LABELS,
} from '../../../../lib/labels';
import type { ContractEntity, ContractRenewalEntity } from '../../../../types/entities';
import { formatCurrency, formatDate, formatDateTime, formatPercent } from '../../../../utils/format';

const RECENT_RENEWALS_LIMIT = 5;

const RECENT_BILLINGS_LIMIT = 5;

const RECENT_TRIPS_LIMIT = 10;

export default function CustomerDetailPage(): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const [createContractOpen, setCreateContractOpen] = useState(false);
  const [createTableOpen, setCreateTableOpen] = useState(false);
  const [editCustomerOpen, setEditCustomerOpen] = useState(false);
  const [renewContract, setRenewContract] = useState<ContractEntity | null>(null);
  const [completeRenewal, setCompleteRenewal] = useState<ContractRenewalEntity | null>(null);
  const [cancelRenewal, setCancelRenewal] = useState<ContractRenewalEntity | null>(null);

  const customerQuery = useQuery({
    queryKey: ['customers', customerId],
    queryFn: () => getCustomer(customerId),
  });

  // Fase 93 -- indicadores basicos do CRM, NAO financeiros (ver
  // CustomerSummaryEntity). Indicadores financeiros continuam vindo dos
  // dashboards abaixo (Freight/Billing/Receivables), nunca duplicados aqui.
  const summaryQuery = useQuery({
    queryKey: ['customers', customerId, 'summary'],
    queryFn: () => getCustomerSummary(customerId),
  });

  const contractsQuery = useQuery({
    queryKey: ['freight', 'contracts', { customerId, status: 'ACTIVE' }],
    queryFn: () => listContracts({ customerId, status: 'ACTIVE', pageSize: 20 }),
  });

  const tablesQuery = useQuery({
    queryKey: ['freight', 'tables', { customerId, status: 'ACTIVE' }],
    queryFn: () => listFreightTables({ customerId, status: 'ACTIVE', pageSize: 20 }),
  });

  const tripsQuery = useQuery({
    queryKey: ['trips', { customerId, pageSize: RECENT_TRIPS_LIMIT }],
    queryFn: () => listTrips({ customerId, pageSize: RECENT_TRIPS_LIMIT, sortBy: 'createdAt', sortOrder: 'desc' }),
  });

  const dashboardQuery = useQuery({
    queryKey: ['freight', 'dashboard', { customerId }],
    queryFn: () => getFreightDashboard({ customerId }),
  });

  // Fase 97 -- receita/custo REAL (nao contratado/projetado) das viagens
  // deste cliente, mesma metodologia de TripSettlementsService -- nunca
  // duplicada com os cartoes de Frete/Faturamento acima.
  const profitabilityQuery = useQuery({
    queryKey: ['customer-profitability', customerId],
    queryFn: () => getCustomerProfitabilityForCustomer(customerId),
  });

  // Fase 98 -- indicadores e historico de renovacao de contratos deste
  // cliente, reaproveitando o mesmo Contract/ContractRenewal do modulo de
  // Fretes (nunca um segundo sistema de contratos).
  const renewalSummaryQuery = useQuery({
    queryKey: ['contract-renewals', 'summary', { customerId }],
    queryFn: () => getContractRenewalSummary({ customerId }),
  });

  const renewalsQuery = useQuery({
    queryKey: ['contract-renewals', 'list', { customerId, pageSize: RECENT_RENEWALS_LIMIT }],
    queryFn: () => listContractRenewals({ customerId, pageSize: RECENT_RENEWALS_LIMIT }),
  });

  const cancelRenewalMutation = useMutation({
    mutationFn: (id: string) => cancelContractRenewal(id),
    onSuccess: () => {
      toast.success('Renovação cancelada.');
      queryClient.invalidateQueries({ queryKey: ['contract-renewals'] });
      setCancelRenewal(null);
    },
    onError: (error) => toast.error('Não foi possível cancelar a renovação.', toFriendlyMessage(error)),
  });

  const billingDashboardQuery = useQuery({
    queryKey: ['billing', 'dashboard', { customerId }],
    queryFn: () => getBillingDashboard({ customerId }),
  });

  const recentBillingsQuery = useQuery({
    queryKey: ['billing', 'list', { customerId, pageSize: RECENT_BILLINGS_LIMIT }],
    queryFn: () => listTripBillings({ customerId, pageSize: RECENT_BILLINGS_LIMIT }),
  });

  const receivablesDashboardQuery = useQuery({
    queryKey: ['receivables', 'dashboard', { customerId }],
    queryFn: () => getReceivablesDashboard({ customerId }),
  });

  const openReceivablesQuery = useQuery({
    queryKey: ['receivables', 'list', { customerId, status: undefined, pageSize: RECENT_BILLINGS_LIMIT }],
    queryFn: () => listReceivables({ customerId, pageSize: RECENT_BILLINGS_LIMIT }),
  });

  if (customerQuery.isLoading) return <LoadingState label="Carregando cliente" />;
  if (customerQuery.isError || !customerQuery.data) return <ErrorState onRetry={() => customerQuery.refetch()} />;

  const customer = customerQuery.data;

  return (
    <div>
      <PageHeader
        title={customer.name}
        description={
          [customer.document, customer.phone, customer.email, customer.address].filter(Boolean).join(' · ') ||
          undefined
        }
        breadcrumb={[{ label: 'Clientes', href: '/customers' }, { label: customer.name }]}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={customer.isActive ? 'success' : 'neutral'}>{customer.isActive ? 'Ativo' : 'Inativo'}</Badge>
            {hasRole(user?.role, TRIP_WRITE_ROLES) && (
              <Button variant="outline" size="sm" onClick={() => setEditCustomerOpen(true)}>
                <Pencil size={14} />
                Editar cliente
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-6">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Indicadores — contagens derivadas de viagens, contatos e contratos deste cliente
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Viagens (total)"
              value={summaryQuery.data ? String(summaryQuery.data.tripsTotal) : '—'}
            />
            <StatCard
              label="Última viagem registrada"
              value={summaryQuery.data?.lastTripAt ? formatDate(summaryQuery.data.lastTripAt) : '—'}
            />
            <StatCard
              label="Contatos cadastrados"
              value={summaryQuery.data ? String(summaryQuery.data.contactsCount) : '—'}
            />
            <StatCard
              label="Contratos ativos"
              value={
                summaryQuery.data ? `${summaryQuery.data.activeContractsCount} de ${summaryQuery.data.contractsTotal}` : '—'
              }
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Contratos e Fretes — valor contratado, faturamento e margem no escopo deste cliente
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Valor contratado"
              value={dashboardQuery.data ? formatCurrency(dashboardQuery.data.contractedAmountTotal) : '—'}
              tone="brand"
            />
            <StatCard
              label="Faturamento (receita realizada)"
              value={dashboardQuery.data ? formatCurrency(dashboardQuery.data.realizedRevenueTotal) : '—'}
            />
            <StatCard
              label="Margem prevista"
              value={dashboardQuery.data ? formatCurrency(dashboardQuery.data.projectedMarginTotal) : '—'}
              tone="info"
            />
            <StatCard label="Fretes realizados" value={dashboardQuery.data ? String(dashboardQuery.data.freightsCount) : '—'} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Renovação de contratos — vencimento e renovações deste cliente (Fase 98)
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Contratos vencendo"
              value={renewalSummaryQuery.data ? String(renewalSummaryQuery.data.expiringCount) : '—'}
              tone="warning"
            />
            <StatCard
              label="Contratos vencidos"
              value={renewalSummaryQuery.data ? String(renewalSummaryQuery.data.expiredCount) : '—'}
              tone="danger"
            />
            <StatCard
              label="Renovações em andamento"
              value={renewalSummaryQuery.data ? String(renewalSummaryQuery.data.pendingRenewalsCount) : '—'}
              tone="info"
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Rentabilidade — receita e custo real das viagens (Fase 97)
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Receita real"
              value={profitabilityQuery.data ? formatCurrency(profitabilityQuery.data.revenue) : '—'}
              tone="brand"
            />
            <StatCard
              label="Custo real"
              value={profitabilityQuery.data ? formatCurrency(profitabilityQuery.data.cost) : '—'}
              tone="warning"
            />
            <StatCard
              label="Resultado"
              value={profitabilityQuery.data ? formatCurrency(profitabilityQuery.data.result) : '—'}
              tone={profitabilityQuery.data && profitabilityQuery.data.result < 0 ? 'danger' : 'success'}
            />
            <StatCard
              label="Margem"
              value={
                profitabilityQuery.data?.marginPercent !== null && profitabilityQuery.data?.marginPercent !== undefined
                  ? formatPercent(profitabilityQuery.data.marginPercent)
                  : '—'
              }
              tone="info"
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Faturamento — conciliação comercial das viagens deste cliente
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total faturado"
              value={billingDashboardQuery.data ? formatCurrency(billingDashboardQuery.data.totalInvoiced) : '—'}
              tone="success"
            />
            <StatCard
              label="Saldo a faturar"
              value={billingDashboardQuery.data ? formatCurrency(billingDashboardQuery.data.balanceToInvoice) : '—'}
              tone="warning"
            />
            <StatCard
              label="Faturamentos registrados"
              value={recentBillingsQuery.data ? String(recentBillingsQuery.data.meta.total) : '—'}
            />
            <StatCard
              label="Viagens pendentes"
              value={billingDashboardQuery.data ? String(billingDashboardQuery.data.pendingCount) : '—'}
            />
          </div>
          <Card className="mt-4">
            <CardHeader title="Últimos faturamentos" />
            <ul className="divide-y divide-border">
              {recentBillingsQuery.data?.items.length === 0 && (
                <li className="px-5 py-4 text-sm text-ink-subtle">Nenhum faturamento registrado ainda.</li>
              )}
              {recentBillingsQuery.data?.items.map((b) => (
                <li key={b.id ?? b.tripId} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <a href={`/trips/${b.tripId}`} className="min-w-0 truncate text-brand-700 hover:underline">
                    {b.tripLabel ?? b.tripId}
                  </a>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-medium">{formatCurrency(b.invoicedAmount)}</span>
                    <Badge tone={TRIP_BILLING_STATUS_TONE[b.status]}>{TRIP_BILLING_STATUS_LABELS[b.status]}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Contas a receber — títulos gerados a partir do faturamento (Fase 72)
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Faturado"
              value={receivablesDashboardQuery.data ? formatCurrency(receivablesDashboardQuery.data.summary.totalInvoiced) : '—'}
            />
            <StatCard
              label="Recebido"
              value={receivablesDashboardQuery.data ? formatCurrency(receivablesDashboardQuery.data.summary.totalReceived) : '—'}
              tone="success"
            />
            <StatCard
              label="Saldo em aberto"
              value={receivablesDashboardQuery.data ? formatCurrency(receivablesDashboardQuery.data.summary.totalOpen) : '—'}
              tone="info"
            />
            <StatCard
              label="Vencido"
              value={receivablesDashboardQuery.data ? formatCurrency(receivablesDashboardQuery.data.summary.totalOverdue) : '—'}
              tone="danger"
            />
          </div>
          <Card className="mt-4">
            <CardHeader title="Títulos" description="Mais recentes deste cliente." />
            <ul className="divide-y divide-border">
              {openReceivablesQuery.data?.items.length === 0 && (
                <li className="px-5 py-4 text-sm text-ink-subtle">Nenhuma conta a receber gerada para este cliente ainda.</li>
              )}
              {openReceivablesQuery.data?.items.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <a href={`/trips/${r.tripId}`} className="min-w-0 truncate text-brand-700 hover:underline">
                    {r.tripLabel ?? r.tripId}
                  </a>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-ink-subtle">vence {formatDate(r.dueDate)}</span>
                    <span className="font-medium">{formatCurrency(r.balance)}</span>
                    <Badge tone={RECEIVABLE_STATUS_TONE[r.status]}>{RECEIVABLE_STATUS_LABELS[r.status]}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Contratos ativos"
              action={
                hasRole(user?.role, FREIGHT_WRITE_ROLES) && (
                  <Button variant="outline" size="sm" onClick={() => setCreateContractOpen(true)}>
                    <Plus size={14} />
                    Novo
                  </Button>
                )
              }
            />
            <ul className="divide-y divide-border">
              {contractsQuery.data?.items.length === 0 && (
                <li className="px-5 py-4 text-sm text-ink-subtle">Nenhum contrato ativo.</li>
              )}
              {contractsQuery.data?.items.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="truncate">{c.code}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-ink-subtle">
                      {c.endDate ? `até ${formatDate(c.endDate)}` : 'sem término definido'}
                    </span>
                    {hasRole(user?.role, FREIGHT_WRITE_ROLES) && (
                      <Button variant="ghost" size="sm" onClick={() => setRenewContract(c)}>
                        <RefreshCw size={14} />
                        Renovar
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader
              title="Renovações"
              description="Histórico de vigências — a vigência anterior nunca é sobrescrita."
            />
            <ul className="divide-y divide-border">
              {renewalsQuery.data?.items.length === 0 && (
                <li className="px-5 py-4 text-sm text-ink-subtle">Nenhuma renovação registrada para este cliente.</li>
              )}
              {renewalsQuery.data?.items.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 px-5 py-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="truncate">
                      {r.previousContractCode} {r.newContractCode ? `→ ${r.newContractCode}` : ''}
                    </span>
                    <Badge tone={CONTRACT_RENEWAL_STATUS_TONE[r.status]}>{CONTRACT_RENEWAL_STATUS_LABELS[r.status]}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-ink-subtle">
                    <span>
                      {r.previousEndDate ? `vigência anterior até ${formatDate(r.previousEndDate)}` : 'sem vigência anterior definida'}
                      {r.newStartDate ? ` · nova vigência desde ${formatDate(r.newStartDate)}` : ''}
                    </span>
                    {hasRole(user?.role, FREIGHT_WRITE_ROLES) && r.status === 'PENDING' && (
                      <span className="flex shrink-0 items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setCompleteRenewal(r)}>
                          Concluir
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setCancelRenewal(r)}>
                          Cancelar
                        </Button>
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-ink-subtle">
                    iniciada em {formatDateTime(r.initiatedAt)}
                    {r.initiatorName ? ` por ${r.initiatorName}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Tabelas de frete vigentes"
              action={
                hasRole(user?.role, FREIGHT_WRITE_ROLES) && (
                  <Button variant="outline" size="sm" onClick={() => setCreateTableOpen(true)}>
                    <Plus size={14} />
                    Nova
                  </Button>
                )
              }
            />
            <ul className="divide-y divide-border">
              {tablesQuery.data?.items.length === 0 && (
                <li className="px-5 py-4 text-sm text-ink-subtle">Nenhuma tabela vigente.</li>
              )}
              {tablesQuery.data?.items.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="truncate">{t.name} ({t.code})</span>
                  <span className="shrink-0 text-ink-subtle">{t.activeRulesCount} regra(s) vigente(s)</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CustomerContactsCard customerId={customerId} />
          <CustomerNotesCard customerId={customerId} />
        </div>

        <Card>
          <CardHeader title="Últimas viagens" description="10 mais recentes." />
          <ul className="divide-y divide-border">
            {tripsQuery.data?.items.length === 0 && (
              <li className="px-5 py-4 text-sm text-ink-subtle">Nenhuma viagem registrada para este cliente.</li>
            )}
            {tripsQuery.data?.items.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <a href={`/trips/${t.id}`} className="min-w-0 truncate text-brand-700 hover:underline">
                  {t.originName} → {t.destinationName}
                </a>
                <Badge tone={TRIP_STATUS_TONE[t.status]}>{TRIP_STATUS_LABELS[t.status]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <ContractFormModal open={createContractOpen} onClose={() => setCreateContractOpen(false)} defaultCustomerId={customerId} />
      <FreightTableFormModal open={createTableOpen} onClose={() => setCreateTableOpen(false)} defaultCustomerId={customerId} />
      <CustomerFormModal open={editCustomerOpen} onClose={() => setEditCustomerOpen(false)} customer={customer} />
      <InitiateRenewalModal
        open={renewContract !== null}
        onClose={() => setRenewContract(null)}
        contractId={renewContract?.id ?? null}
        contractCode={renewContract?.code}
      />
      <CompleteRenewalModal open={completeRenewal !== null} onClose={() => setCompleteRenewal(null)} renewal={completeRenewal} />
      <ConfirmDialog
        open={cancelRenewal !== null}
        onClose={() => setCancelRenewal(null)}
        onConfirm={() => cancelRenewal && cancelRenewalMutation.mutate(cancelRenewal.id)}
        title="Cancelar renovação"
        description={`Cancelar a renovação do contrato ${cancelRenewal?.previousContractCode ?? ''}? O contrato anterior não é alterado.`}
        confirmLabel="Cancelar renovação"
        danger
        loading={cancelRenewalMutation.isPending}
      />
    </div>
  );
}
