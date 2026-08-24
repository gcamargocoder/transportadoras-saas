import { Receivable, ReceivablePayment, UserAccount } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { ReceivablePaymentEntity } from '../entities/receivable-payment.entity';
import { ReceivableEntity } from '../entities/receivable.entity';
import { computeBalance, computeEffectiveStatus } from '../utils/receivable-status.util';

export type ReceivablePaymentWithRelations = ReceivablePayment & {
  creator: UserAccount | null;
  financialAccount?: { name: string } | null;
};

export type ReceivableWithRelations = Receivable & {
  customer: { name: string } | null;
  trip: { origin: { name: string }; destination: { name: string } };
  creator: UserAccount | null;
  canceller: UserAccount | null;
  payments?: ReceivablePaymentWithRelations[];
};

export function toReceivablePaymentEntity(row: ReceivablePaymentWithRelations): ReceivablePaymentEntity {
  const entity = new ReceivablePaymentEntity();
  entity.id = row.id;
  entity.receivableId = row.receivableId;
  entity.amount = toNumberOrNull(row.amount) ?? 0;
  entity.paymentDate = row.paymentDate;
  entity.paymentMethod = row.paymentMethod;
  entity.reference = row.reference;
  entity.notes = row.notes;
  entity.financialAccountId = row.financialAccountId;
  entity.financialAccountName = row.financialAccount?.name ?? null;
  entity.financialTransactionId = row.financialTransactionId;
  entity.createdBy = row.createdBy;
  entity.creatorName = row.creator?.name ?? null;
  entity.createdAt = row.createdAt;
  return entity;
}

export function toReceivableEntity(row: ReceivableWithRelations, now: Date = new Date()): ReceivableEntity {
  const originalAmount = toNumberOrNull(row.originalAmount) ?? 0;
  const receivedAmount = toNumberOrNull(row.receivedAmount) ?? 0;

  const entity = new ReceivableEntity();
  entity.id = row.id;
  entity.customerId = row.customerId;
  entity.customerName = row.customer?.name ?? null;
  entity.tripId = row.tripId;
  entity.tripLabel = `${row.trip.origin.name} → ${row.trip.destination.name}`;
  entity.billingId = row.billingId;
  entity.description = row.description;
  entity.originalAmount = originalAmount;
  entity.receivedAmount = receivedAmount;
  entity.balance = computeBalance(originalAmount, receivedAmount);
  entity.issueDate = row.issueDate;
  entity.dueDate = row.dueDate;
  entity.status = computeEffectiveStatus(row.status, row.dueDate, now);
  entity.cancelledAt = row.cancelledAt;
  entity.cancelledBy = row.cancelledBy;
  entity.cancellerName = row.canceller?.name ?? null;
  entity.createdBy = row.createdBy;
  entity.creatorName = row.creator?.name ?? null;
  entity.createdAt = row.createdAt;
  entity.updatedAt = row.updatedAt;
  if (row.payments) {
    entity.payments = row.payments
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(toReceivablePaymentEntity);
  }
  return entity;
}
