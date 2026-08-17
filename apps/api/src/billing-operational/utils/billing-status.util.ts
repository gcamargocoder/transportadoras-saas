// Funcoes puras de calculo de faturamento operacional (Fase 60) -- nunca
// leem/escrevem banco, nunca conhecem Prisma.Decimal. O motor de calculo
// comercial (Fase 59) NUNCA e reexecutado aqui -- billableAmount sempre
// vem pronto (snapshot de TripFreight), nunca recalculado.

export type ComputedBillingStatus = 'DRAFT' | 'READY' | 'PARTIALLY_INVOICED' | 'INVOICED';

/// Deriva o status a partir dos valores -- PAID e CANCELLED NUNCA sao
/// derivados aqui (sao sempre transicoes manuais explicitas, ver
/// TripBillingService.updateStatus/cancel).
export function computeBillingStatusFromAmounts(
  billableAmount: number | null,
  invoicedAmount: number,
): ComputedBillingStatus {
  if (billableAmount === null || billableAmount <= 0) {
    return invoicedAmount > 0 ? 'PARTIALLY_INVOICED' : 'DRAFT';
  }
  if (invoicedAmount <= 0) return 'READY';
  if (invoicedAmount >= billableAmount) return 'INVOICED';
  return 'PARTIALLY_INVOICED';
}

/// Saldo nunca negativo (billableAmount menor que o ja faturado e um
/// estado anomalo -- ex: contractedAmount reduzido depois de faturamentos
/// parciais -- trata como saldo zero, nunca um numero negativo exibido).
export function computeBillingBalance(billableAmount: number | null, invoicedAmount: number): number | null {
  if (billableAmount === null) return null;
  const balance = round2(billableAmount - invoicedAmount);
  return balance > 0 ? balance : 0;
}

export type InvoiceAmountResolution =
  | { ok: true; amount: number }
  | { ok: false; reason: 'NO_BALANCE' | 'EXCEEDS_BALANCE' | 'INVALID_AMOUNT' };

/// Resolve o valor a faturar numa acao de faturamento: `requestedAmount`
/// ausente = faturamento TOTAL (usa o saldo inteiro); presente = parcial.
/// Nunca permite ultrapassar o saldo (secao 4 -- "valor faturado nunca
/// pode ultrapassar o valor faturavel").
export function resolveInvoiceAmount(
  requestedAmount: number | null | undefined,
  balance: number,
): InvoiceAmountResolution {
  if (balance <= 0) return { ok: false, reason: 'NO_BALANCE' };
  const amount = requestedAmount ?? balance;
  if (amount <= 0) return { ok: false, reason: 'INVALID_AMOUNT' };
  if (round2(amount) > balance) return { ok: false, reason: 'EXCEEDS_BALANCE' };
  return { ok: true, amount: round2(amount) };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
