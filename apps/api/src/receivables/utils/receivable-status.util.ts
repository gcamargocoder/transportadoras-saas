import { Prisma, ReceivableStatus } from '@prisma/client';
import {
  buildBalanceStatusWhereFields,
  computeBalance,
  computeEffectiveBalanceStatus,
  computeWrittenBalanceStatus,
  round2,
} from '../../common/utils/balance-status.util';

// Fase 72 -- regra de status de conta a receber, agora sobre o nucleo
// COMPARTILHADO com Payable (Fase 73, ver common/utils/balance-status.util.ts).
// Prioridade: CANCELLED > PAID > OVERDUE > PARTIALLY_RECEIVED > OPEN.
const VALUES = {
  open: ReceivableStatus.OPEN,
  partial: ReceivableStatus.PARTIALLY_RECEIVED,
  paid: ReceivableStatus.PAID,
  cancelled: ReceivableStatus.CANCELLED,
};

export function computeWrittenStatus(
  originalAmount: number,
  receivedAmount: number,
  cancelledAt: Date | null,
): ReceivableStatus {
  return computeWrittenBalanceStatus(originalAmount, receivedAmount, cancelledAt, VALUES);
}

export type EffectiveReceivableStatus = ReceivableStatus | 'OVERDUE';

// Usado pelo DTO de filtro (@IsIn) -- ReceivableStatus (enum Prisma) nunca
// inclui 'OVERDUE', entao @IsEnum sozinho nao bastaria para validar o
// filtro de listagem/dashboard.
export const EFFECTIVE_RECEIVABLE_STATUS_VALUES: EffectiveReceivableStatus[] = [
  ReceivableStatus.OPEN,
  ReceivableStatus.PARTIALLY_RECEIVED,
  ReceivableStatus.PAID,
  ReceivableStatus.CANCELLED,
  'OVERDUE',
];

export function computeEffectiveStatus(
  status: ReceivableStatus,
  dueDate: Date,
  now: Date = new Date(),
): EffectiveReceivableStatus {
  return computeEffectiveBalanceStatus(status, dueDate, VALUES, now);
}

export function buildReceivableStatusWhere(
  status: EffectiveReceivableStatus,
  now: Date = new Date(),
): Prisma.ReceivableWhereInput {
  return buildBalanceStatusWhereFields(status, VALUES, now) as Prisma.ReceivableWhereInput;
}

export { computeBalance, round2 };
