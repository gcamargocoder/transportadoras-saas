import { SubscriptionPayment, TenantSubscription } from '@prisma/client';
import { daysOverdue } from '../utils/billing-date.util';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { SubscriptionPaymentEntity } from '../entities/subscription-payment.entity';

export type SubscriptionWithTenant = TenantSubscription & { tenant: { name: string } };

// `now` injetavel para testes controlarem daysOverdue sem sleep real.
// `lastPayment` so vem preenchido quando o service resolve (detalhe de 1
// assinatura) -- a listagem paginada nunca resolve isso por linha.
export function toSubscriptionEntity(
  subscription: SubscriptionWithTenant,
  lastPayment: SubscriptionPayment | null = null,
  now: Date = new Date(),
): SubscriptionEntity {
  const entity = new SubscriptionEntity();
  entity.id = subscription.id;
  entity.tenantId = subscription.tenantId;
  entity.tenantName = subscription.tenant.name;
  entity.planTier = subscription.planTier;
  entity.amount = subscription.amount.toNumber();
  entity.periodicity = subscription.periodicity;
  entity.paymentMethod = subscription.paymentMethod;
  entity.startDate = subscription.startDate;
  entity.dueDay = subscription.dueDay;
  entity.nextDueDate = subscription.nextDueDate;
  entity.status = subscription.status;
  entity.daysOverdue =
    subscription.status === 'OVERDUE' ? daysOverdue(subscription.nextDueDate, now) : 0;
  entity.notes = subscription.notes;
  entity.lastPaymentAt = lastPayment?.paidAt ?? null;
  entity.lastPaymentStatus = lastPayment?.status ?? null;
  entity.createdAt = subscription.createdAt;
  entity.updatedAt = subscription.updatedAt;
  return entity;
}

export type SubscriptionPaymentWithCreator = SubscriptionPayment & { creator: { name: string } };

export function toSubscriptionPaymentEntity(payment: SubscriptionPaymentWithCreator): SubscriptionPaymentEntity {
  const entity = new SubscriptionPaymentEntity();
  entity.id = payment.id;
  entity.tenantId = payment.tenantId;
  entity.subscriptionId = payment.subscriptionId;
  entity.amount = payment.amount.toNumber();
  entity.dueDate = payment.dueDate;
  entity.paidAt = payment.paidAt;
  entity.paymentMethod = payment.paymentMethod;
  entity.status = payment.status;
  entity.reference = payment.reference;
  entity.createdBy = payment.createdBy;
  entity.createdByName = payment.creator.name;
  entity.createdAt = payment.createdAt;
  return entity;
}
