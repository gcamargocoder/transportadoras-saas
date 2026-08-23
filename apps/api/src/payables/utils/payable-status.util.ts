import { PayableStatus, Prisma } from '@prisma/client';
import {
  buildBalanceStatusWhereFields,
  computeBalance,
  computeEffectiveBalanceStatus,
  computeWrittenBalanceStatus,
  round2,
} from '../../common/utils/balance-status.util';

// Fase 73 -- regra de status de conta a pagar, sobre o nucleo
// COMPARTILHADO com Receivable (Fase 72, ver common/utils/balance-status.util.ts).
// Prioridade: CANCELLED > PAID > OVERDUE > PARTIALLY_PAID > OPEN.
const VALUES = {
  open: PayableStatus.OPEN,
  partial: PayableStatus.PARTIALLY_PAID,
  paid: PayableStatus.PAID,
  cancelled: PayableStatus.CANCELLED,
};

export function computeWrittenStatus(
  originalAmount: number,
  paidAmount: number,
  cancelledAt: Date | null,
): PayableStatus {
  return computeWrittenBalanceStatus(originalAmount, paidAmount, cancelledAt, VALUES);
}

export type EffectivePayableStatus = PayableStatus | 'OVERDUE';

// Usado pelo DTO de filtro (@IsIn) -- PayableStatus (enum Prisma) nunca
// inclui 'OVERDUE'.
export const EFFECTIVE_PAYABLE_STATUS_VALUES: EffectivePayableStatus[] = [
  PayableStatus.OPEN,
  PayableStatus.PARTIALLY_PAID,
  PayableStatus.PAID,
  PayableStatus.CANCELLED,
  'OVERDUE',
];

export function computeEffectiveStatus(
  status: PayableStatus,
  dueDate: Date,
  now: Date = new Date(),
): EffectivePayableStatus {
  return computeEffectiveBalanceStatus(status, dueDate, VALUES, now);
}

export function buildPayableStatusWhere(
  status: EffectivePayableStatus,
  now: Date = new Date(),
): Prisma.PayableWhereInput {
  return buildBalanceStatusWhereFields(status, VALUES, now) as Prisma.PayableWhereInput;
}

export { computeBalance, round2 };
