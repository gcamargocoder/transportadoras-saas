import type { Paginated, PaginationParams } from '../../types/api';
import type {
  BillingDashboardEntity,
  SubscriptionEntity,
  SubscriptionPaymentEntity,
} from '../../types/entities';
import type {
  BillingPeriodicity,
  SubscriptionPaymentMethod,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
  TenantPlanTier,
} from '../../types/enums';
import { api } from './http';

// Fase 50 -- Gestao Manual de Assinaturas e Cobranca (SUPER_ADMIN only,
// area /super-admin/billing). Mesmo padrao de super-admin.api.ts.

export interface FindSubscriptionsQuery extends PaginationParams {
  tenantId?: string | undefined;
  search?: string | undefined;
  status?: SubscriptionStatus | undefined;
  paymentMethod?: SubscriptionPaymentMethod | undefined;
  planTier?: TenantPlanTier | undefined;
  dueFrom?: string | undefined;
  dueTo?: string | undefined;
}

export function listSubscriptions(query: FindSubscriptionsQuery = {}, signal?: AbortSignal) {
  return api.get<Paginated<SubscriptionEntity>>('/billing/subscriptions', query, signal);
}

export function getSubscription(id: string, signal?: AbortSignal) {
  return api.get<SubscriptionEntity>(`/billing/subscriptions/${id}`, undefined, signal);
}

export interface CreateSubscriptionPayload {
  tenantId: string;
  planTier: TenantPlanTier;
  amount: number;
  periodicity: BillingPeriodicity;
  paymentMethod: SubscriptionPaymentMethod;
  startDate: string;
  dueDay: number;
  notes?: string | undefined;
}

export function createSubscription(payload: CreateSubscriptionPayload) {
  return api.post<SubscriptionEntity>('/billing/subscriptions', payload);
}

export interface UpdateSubscriptionPayload {
  planTier?: TenantPlanTier | undefined;
  amount?: number | undefined;
  periodicity?: BillingPeriodicity | undefined;
  paymentMethod?: SubscriptionPaymentMethod | undefined;
  dueDay?: number | undefined;
  nextDueDate?: string | undefined;
  status?: SubscriptionStatus | undefined;
  notes?: string | undefined;
}

export function updateSubscription(id: string, payload: UpdateSubscriptionPayload) {
  return api.patch<SubscriptionEntity>(`/billing/subscriptions/${id}`, payload);
}

export interface RegisterPaymentPayload {
  amount: number;
  dueDate: string;
  paidAt?: string | undefined;
  paymentMethod: SubscriptionPaymentMethod;
  status: SubscriptionPaymentStatus;
  reference?: string | undefined;
}

export function registerPayment(subscriptionId: string, payload: RegisterPaymentPayload) {
  return api.post<SubscriptionPaymentEntity>(`/billing/subscriptions/${subscriptionId}/payments`, payload);
}

export function listPayments(subscriptionId: string, query: PaginationParams = {}, signal?: AbortSignal) {
  return api.get<Paginated<SubscriptionPaymentEntity>>(
    `/billing/subscriptions/${subscriptionId}/payments`,
    query,
    signal,
  );
}

export function getBillingDashboard(
  query: { from?: string | undefined; to?: string | undefined } = {},
  signal?: AbortSignal,
) {
  return api.get<BillingDashboardEntity>('/billing/dashboard', query, signal);
}
