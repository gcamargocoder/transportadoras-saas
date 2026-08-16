'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Truck, UserRound, Users, Wrench, Fuel, ClipboardCheck, Paperclip, Route, HardDrive, Receipt } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardHeader } from '../../../../components/ui/card';
import { DataTable } from '../../../../components/ui/data-table';
import { ErrorState } from '../../../../components/ui/error-state';
import { FormField } from '../../../../components/ui/form-field';
import { Input } from '../../../../components/ui/input';
import { PageHeader } from '../../../../components/ui/page-header';
import { Select } from '../../../../components/ui/select';
import { SkeletonCards } from '../../../../components/ui/skeleton';
import { StatCard } from '../../../../components/ui/stat-card';
import { useToast } from '../../../../components/ui/toast';
import { CreateSubscriptionModal } from '../../../../features/billing/create-subscription-modal';
import { EditSubscriptionModal } from '../../../../features/billing/edit-subscription-modal';
import { RegisterPaymentModal } from '../../../../features/billing/register-payment-modal';
import { getSubscription, listSubscriptions } from '../../../../lib/api/billing.api';
import { toFriendlyMessage } from '../../../../lib/api/errors';
import {
  getTenant,
  getTenantHistory,
  getTenantUsage,
  updateTenantPlan,
  updateTenantStatus,
} from '../../../../lib/api/super-admin.api';
import {
  BILLING_PERIODICITY_LABELS,
  SUBSCRIPTION_PAYMENT_METHOD_LABELS,
  SUBSCRIPTION_PAYMENT_STATUS_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TONE,
  TENANT_MODULE_LABELS,
  TENANT_PLAN_TIER_LABELS,
  TENANT_STATUS_LABELS,
  TENANT_STATUS_TONE,
} from '../../../../lib/labels';
import type { AuditLogEntity } from '../../../../types/entities';
import type { TenantModule, TenantPlanTier, TenantStatus } from '../../../../types/enums';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '../../../../utils/format';

const ALL_MODULES = Object.keys(TENANT_MODULE_LABELS) as TenantModule[];

// Fase 48 -- "15 / 20" quando o plano tem limite configurado para o
// recurso, senao so o valor bruto (sem limite = nunca mostra "/ null").
function usageValue(current: number, max: number | null | undefined): string {
  return max == null ? formatNumber(current) : `${formatNumber(current)} / ${formatNumber(max)}`;
}

function usageTone(current: number, max: number | null | undefined): 'brand' | 'warning' {
  return max != null && current >= max ? 'warning' : 'brand';
}
const ALL_STATUSES = Object.keys(TENANT_STATUS_LABELS) as TenantStatus[];
const ALL_TIERS = Object.keys(TENANT_PLAN_TIER_LABELS) as TenantPlanTier[];

export default function SuperAdminTenantDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const tenantId = params.id;
  const queryClient = useQueryClient();
  const toast = useToast();
  const [historyPage, setHistoryPage] = useState(1);
  const [createSubOpen, setCreateSubOpen] = useState(false);
  const [editSubOpen, setEditSubOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const tenantQuery = useQuery({
    queryKey: ['super-admin', 'tenant', tenantId],
    queryFn: ({ signal }) => getTenant(tenantId, signal),
  });

  const usageQuery = useQuery({
    queryKey: ['super-admin', 'tenant', tenantId, 'usage'],
    queryFn: ({ signal }) => getTenantUsage(tenantId, signal),
  });

  const historyQuery = useQuery({
    queryKey: ['super-admin', 'tenant', tenantId, 'history', historyPage],
    queryFn: ({ signal }) => getTenantHistory(tenantId, { page: historyPage, pageSize: 10 }, signal),
  });

  // Fase 50 -- lista por tenantId (no maximo 1 resultado, tenantId e
  // @unique em TenantSubscription) so para descobrir o id; o detalhe
  // completo (com ultimo pagamento resolvido) vem da 2a query encadeada
  // abaixo -- nunca 1 query por linha, esta pagina e sempre "1 tenant".
  const subscriptionListQuery = useQuery({
    queryKey: ['super-admin', 'billing', 'subscriptions', { tenantId }],
    queryFn: ({ signal }) => listSubscriptions({ tenantId, pageSize: 1 }, signal),
  });
  const subscriptionId = subscriptionListQuery.data?.items[0]?.id;

  const subscriptionQuery = useQuery({
    queryKey: ['super-admin', 'billing', 'subscription', subscriptionId],
    queryFn: ({ signal }) => getSubscription(subscriptionId as string, signal),
    enabled: Boolean(subscriptionId),
  });
  const subscription = subscriptionQuery.data ?? null;

  const statusMutation = useMutation({
    mutationFn: (status: TenantStatus) => updateTenantStatus(tenantId, status),
    onSuccess: () => {
      toast.success('Status atualizado.');
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenant', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenants'] });
    },
    onError: (error) => toast.error('Não foi possível atualizar o status.', toFriendlyMessage(error)),
  });

  const planMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateTenantPlan>[1]) => updateTenantPlan(tenantId, payload),
    onSuccess: () => {
      toast.success('Plano atualizado.');
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'tenant', tenantId] });
    },
    onError: (error) => toast.error('Não foi possível atualizar o plano.', toFriendlyMessage(error)),
  });

  const historyColumns = useMemo<ColumnDef<AuditLogEntity, unknown>[]>(
    () => [
      { header: 'Ação', accessorFn: (row) => row.action },
      { header: 'Quando', accessorFn: (row) => formatDateTime(row.createdAt) },
      { header: 'IP', accessorFn: (row) => row.ipAddress ?? '—' },
    ],
    [],
  );

  if (tenantQuery.isLoading) return <SkeletonCards count={4} />;
  if (tenantQuery.isError || !tenantQuery.data) return <ErrorState onRetry={() => tenantQuery.refetch()} />;

  const tenant = tenantQuery.data;

  return (
    <div>
      <Link href="/super-admin/tenants" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
        <ArrowLeft size={14} />
        Voltar para transportadoras
      </Link>

      <PageHeader
        title={tenant.name}
        description={tenant.tradeName ?? tenant.document}
        actions={<Badge tone={TENANT_STATUS_TONE[tenant.status]}>{TENANT_STATUS_LABELS[tenant.status]}</Badge>}
      />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Dados cadastrais" />
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div>
              <p className="text-ink-subtle">CNPJ</p>
              <p className="font-medium text-ink">{tenant.document}</p>
            </div>
            <div>
              <p className="text-ink-subtle">Identificador (slug)</p>
              <p className="font-medium text-ink">{tenant.slug}</p>
            </div>
            <div>
              <p className="text-ink-subtle">Criada em</p>
              <p className="font-medium text-ink">{formatDateTime(tenant.createdAt)}</p>
            </div>
            <div>
              <p className="text-ink-subtle">Última atualização</p>
              <p className="font-medium text-ink">{formatDateTime(tenant.updatedAt)}</p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Status" description="Somente Super Admin pode alterar. SUSPENDED/EXPIRED bloqueiam o acesso da transportadora." />
          <div className="flex flex-wrap gap-2 p-5">
            {ALL_STATUSES.map((s) => (
              <Button
                key={s}
                variant={s === tenant.status ? 'primary' : 'outline'}
                size="sm"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate(s)}
              >
                {TENANT_STATUS_LABELS[s]}
              </Button>
            ))}
          </div>
          {(tenant.plan?.trialStartedAt || tenant.plan?.trialEndsAt) && (
            <div className="grid grid-cols-1 gap-4 border-t border-border p-5 sm:grid-cols-3 text-sm">
              <div>
                <p className="text-ink-subtle">Início do trial</p>
                <p className="font-medium text-ink">
                  {tenant.plan.trialStartedAt ? formatDateTime(tenant.plan.trialStartedAt) : '—'}
                </p>
              </div>
              <div>
                <p className="text-ink-subtle">Término do trial</p>
                <p className="font-medium text-ink">
                  {tenant.plan.trialEndsAt ? formatDateTime(tenant.plan.trialEndsAt) : '—'}
                </p>
              </div>
              <div>
                <p className="text-ink-subtle">Dias restantes</p>
                <p className="font-medium text-ink">
                  {tenant.plan.trialDaysRemaining != null ? tenant.plan.trialDaysRemaining : '—'}
                  {tenant.plan.trialExpiringSoon && (
                    <Badge tone="warning" className="ml-2">
                      Expirando em breve
                    </Badge>
                  )}
                </p>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Utilização" description="Contagens reais dos recursos cadastrados nesta transportadora." />
          {usageQuery.isLoading && (
            <div className="p-5">
              <SkeletonCards count={4} />
            </div>
          )}
          {usageQuery.data && (
            <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
              <StatCard
                label="Usuários"
                value={usageValue(usageQuery.data.users, tenant.plan?.maxUsers)}
                tone={usageTone(usageQuery.data.users, tenant.plan?.maxUsers)}
                icon={Users}
              />
              <StatCard
                label="Motoristas"
                value={usageValue(usageQuery.data.drivers, tenant.plan?.maxDrivers)}
                tone={usageTone(usageQuery.data.drivers, tenant.plan?.maxDrivers)}
                icon={UserRound}
              />
              <StatCard
                label="Veículos"
                value={usageValue(usageQuery.data.vehicles, tenant.plan?.maxVehicles)}
                tone={usageTone(usageQuery.data.vehicles, tenant.plan?.maxVehicles)}
                icon={Truck}
              />
              <StatCard label="Viagens" value={formatNumber(usageQuery.data.trips)} icon={Route} />
              <StatCard label="Checklists" value={formatNumber(usageQuery.data.checklistExecutions)} icon={ClipboardCheck} />
              <StatCard label="Abastecimentos" value={formatNumber(usageQuery.data.fuelSupplies)} icon={Fuel} />
              <StatCard label="Manutenções" value={formatNumber(usageQuery.data.maintenances)} icon={Wrench} />
              <StatCard label="Anexos" value={formatNumber(usageQuery.data.attachments)} icon={Paperclip} />
              <StatCard
                label="Armazenamento (MB)"
                value={
                  tenant.plan?.maxStorageMb == null
                    ? formatNumber(usageQuery.data.storageUsedMb, 1)
                    : `${formatNumber(usageQuery.data.storageUsedMb, 1)} / ${formatNumber(tenant.plan.maxStorageMb)}`
                }
                tone={usageTone(usageQuery.data.storageUsedMb, tenant.plan?.maxStorageMb)}
                icon={HardDrive}
              />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Assinatura e cobrança"
            description="Relação comercial manual (PIX agendado / débito automático) -- distinta do plano de módulos/limites abaixo."
            action={
              subscription ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPaymentModalOpen(true)}>
                    Registrar pagamento
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditSubOpen(true)}>
                    Editar assinatura
                  </Button>
                </div>
              ) : (
                <Button size="sm" onClick={() => setCreateSubOpen(true)}>
                  <Receipt size={14} />
                  Criar assinatura
                </Button>
              )
            }
          />
          {subscriptionListQuery.isLoading && (
            <div className="p-5">
              <SkeletonCards count={4} />
            </div>
          )}
          {!subscriptionListQuery.isLoading && !subscription && (
            <p className="p-5 text-sm text-ink-subtle">Esta transportadora ainda não tem assinatura cadastrada.</p>
          )}
          {subscription && (
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div>
                <p className="text-ink-subtle">Status</p>
                <Badge tone={SUBSCRIPTION_STATUS_TONE[subscription.status]}>
                  {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                </Badge>
              </div>
              <div>
                <p className="text-ink-subtle">Plano comercial</p>
                <p className="font-medium text-ink">{TENANT_PLAN_TIER_LABELS[subscription.planTier]}</p>
              </div>
              <div>
                <p className="text-ink-subtle">Valor</p>
                <p className="font-medium text-ink">{formatCurrency(subscription.amount)}</p>
              </div>
              <div>
                <p className="text-ink-subtle">Periodicidade</p>
                <p className="font-medium text-ink">{BILLING_PERIODICITY_LABELS[subscription.periodicity]}</p>
              </div>
              <div>
                <p className="text-ink-subtle">Método</p>
                <p className="font-medium text-ink">{SUBSCRIPTION_PAYMENT_METHOD_LABELS[subscription.paymentMethod]}</p>
              </div>
              <div>
                <p className="text-ink-subtle">Próximo vencimento</p>
                <p className="font-medium text-ink">
                  {formatDate(subscription.nextDueDate)}
                  {subscription.daysOverdue > 0 && (
                    <span className="ml-2 text-xs text-danger-600">{subscription.daysOverdue} dia(s) em atraso</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-ink-subtle">Último pagamento</p>
                <p className="font-medium text-ink">
                  {subscription.lastPaymentAt
                    ? `${formatDate(subscription.lastPaymentAt)} (${SUBSCRIPTION_PAYMENT_STATUS_LABELS[subscription.lastPaymentStatus ?? 'PENDING']})`
                    : '—'}
                </p>
              </div>
            </div>
          )}
        </Card>

        <PlanCard
          tenantId={tenantId}
          plan={tenant.plan}
          onSave={(payload) => planMutation.mutate(payload)}
          saving={planMutation.isPending}
        />

        <Card>
          <CardHeader title="Histórico de auditoria" description="Ações administrativas registradas para esta transportadora." />
          <DataTable
            columns={historyColumns}
            data={historyQuery.data?.items ?? []}
            isLoading={historyQuery.isLoading}
            isError={historyQuery.isError}
            onRetry={() => historyQuery.refetch()}
            getRowId={(row) => row.id}
            emptyTitle="Nenhum evento registrado"
          />
          {historyQuery.data && historyQuery.data.meta.totalPages > 1 && (
            <div className="flex justify-end gap-2 p-4">
              <Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={historyPage >= historyQuery.data.meta.totalPages}
                onClick={() => setHistoryPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </Card>
      </div>

      <CreateSubscriptionModal
        open={createSubOpen}
        onClose={() => setCreateSubOpen(false)}
        tenantId={tenantId}
        tenantName={tenant.name}
      />
      <EditSubscriptionModal
        subscription={editSubOpen ? subscription : null}
        onClose={() => setEditSubOpen(false)}
      />
      <RegisterPaymentModal
        subscription={paymentModalOpen ? subscription : null}
        onClose={() => setPaymentModalOpen(false)}
      />
    </div>
  );
}

function PlanCard({
  plan,
  onSave,
  saving,
}: {
  tenantId: string;
  plan: { tier: TenantPlanTier; maxUsers: number | null; maxVehicles: number | null; maxDrivers: number | null; maxStorageMb: number | null; enabledModules: TenantModule[] } | null;
  onSave: (payload: {
    tier: TenantPlanTier;
    maxUsers?: number | undefined;
    maxVehicles?: number | undefined;
    maxDrivers?: number | undefined;
    maxStorageMb?: number | undefined;
    enabledModules: TenantModule[];
  }) => void;
  saving: boolean;
}): JSX.Element {
  const [tier, setTier] = useState<TenantPlanTier>(plan?.tier ?? 'STARTER');
  const [maxUsers, setMaxUsers] = useState(plan?.maxUsers?.toString() ?? '');
  const [maxVehicles, setMaxVehicles] = useState(plan?.maxVehicles?.toString() ?? '');
  const [maxDrivers, setMaxDrivers] = useState(plan?.maxDrivers?.toString() ?? '');
  const [maxStorageMb, setMaxStorageMb] = useState(plan?.maxStorageMb?.toString() ?? '');
  const [enabledModules, setEnabledModules] = useState<TenantModule[]>(plan?.enabledModules ?? ALL_MODULES);

  function toggleModule(module: TenantModule) {
    setEnabledModules((prev) => (prev.includes(module) ? prev.filter((m) => m !== module) : [...prev, module]));
  }

  function handleSave() {
    onSave({
      tier,
      maxUsers: maxUsers ? Number(maxUsers) : undefined,
      maxVehicles: maxVehicles ? Number(maxVehicles) : undefined,
      maxDrivers: maxDrivers ? Number(maxDrivers) : undefined,
      maxStorageMb: maxStorageMb ? Number(maxStorageMb) : undefined,
      enabledModules,
    });
  }

  return (
    <Card>
      <CardHeader
        title="Plano, limites e módulos"
        description="Controla módulos/limites de uso -- não é a cobrança (ver seção acima). Limites em branco = sem limite."
      />
      <div className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Plano" htmlFor="plan-tier">
            <Select id="plan-tier" value={tier} onChange={(e) => setTier(e.target.value as TenantPlanTier)}>
              {ALL_TIERS.map((t) => (
                <option key={t} value={t}>
                  {TENANT_PLAN_TIER_LABELS[t]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Limite de usuários" htmlFor="max-users" hint="Vazio = sem limite">
            <Input id="max-users" type="number" min={0} value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} />
          </FormField>
          <FormField label="Limite de veículos" htmlFor="max-vehicles" hint="Vazio = sem limite">
            <Input id="max-vehicles" type="number" min={0} value={maxVehicles} onChange={(e) => setMaxVehicles(e.target.value)} />
          </FormField>
          <FormField label="Limite de motoristas" htmlFor="max-drivers" hint="Vazio = sem limite">
            <Input id="max-drivers" type="number" min={0} value={maxDrivers} onChange={(e) => setMaxDrivers(e.target.value)} />
          </FormField>
          <FormField label="Limite de armazenamento (MB)" htmlFor="max-storage" hint="Vazio = sem limite">
            <Input id="max-storage" type="number" min={0} value={maxStorageMb} onChange={(e) => setMaxStorageMb(e.target.value)} />
          </FormField>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">Módulos habilitados</p>
          <div className="flex flex-wrap gap-2">
            {ALL_MODULES.map((m) => {
              const enabled = enabledModules.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleModule(m)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    enabled ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-border text-ink-subtle hover:bg-surface-muted'
                  }`}
                >
                  {TENANT_MODULE_LABELS[m]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} loading={saving}>
            Salvar plano
          </Button>
        </div>
      </div>
    </Card>
  );
}
