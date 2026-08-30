import { Payable, PayablePayment, UserAccount } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { PayablePaymentEntity } from '../entities/payable-payment.entity';
import { PayableEntity } from '../entities/payable.entity';
import { computeBalance, computeEffectiveStatus } from '../utils/payable-status.util';

export type PayablePaymentWithRelations = PayablePayment & {
  creator: UserAccount | null;
  financialAccount?: { name: string } | null;
};

export type PayableWithRelations = Payable & {
  trip: { origin: { name: string }; destination: { name: string } } | null;
  creator: UserAccount | null;
  canceller: UserAccount | null;
  payments?: PayablePaymentWithRelations[];
};

export function toPayablePaymentEntity(row: PayablePaymentWithRelations): PayablePaymentEntity {
  const entity = new PayablePaymentEntity();
  entity.id = row.id;
  entity.payableId = row.payableId;
  entity.amount = toNumberOrNull(row.amount) ?? 0;
  entity.paymentDate = row.paymentDate;
  entity.paymentMethod = row.paymentMethod;
  entity.interestAmount = toNumberOrNull(row.interestAmount);
  entity.fineAmount = toNumberOrNull(row.fineAmount);
  entity.discountAmount = toNumberOrNull(row.discountAmount);
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

export function toPayableEntity(row: PayableWithRelations, now: Date = new Date()): PayableEntity {
  const originalAmount = toNumberOrNull(row.originalAmount) ?? 0;
  const paidAmount = toNumberOrNull(row.paidAmount) ?? 0;

  const entity = new PayableEntity();
  entity.id = row.id;
  entity.tripId = row.tripId;
  entity.tripLabel = row.trip ? `${row.trip.origin.name} → ${row.trip.destination.name}` : null;
  entity.expenseId = row.expenseId;
  entity.supplierName = row.supplierName;
  entity.category = row.category;
  entity.description = row.description;
  entity.originalAmount = originalAmount;
  entity.paidAmount = paidAmount;
  entity.balance = computeBalance(originalAmount, paidAmount);
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
  entity.installmentGroupId = row.installmentGroupId;
  entity.installmentNumber = row.installmentNumber;
  entity.installmentTotal = row.installmentTotal;
  entity.fiscalDocumentId = row.fiscalDocumentId;
  if (row.payments) {
    entity.payments = row.payments
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(toPayablePaymentEntity);
  }
  return entity;
}
