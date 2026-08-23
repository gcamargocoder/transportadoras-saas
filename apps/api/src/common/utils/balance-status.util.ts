// Fase 73 -- nucleo COMPARTILHADO da regra de status "titulo com saldo e
// vencimento" (Receivable, Fase 72, e Payable, Fase 73 -- mesma forma,
// enums Prisma distintos). Extraido aqui para nao duplicar a logica entre
// os dois modulos (secao 5 do pedido da Fase 73: "reutilizar o padrao de
// ReceivablePayment... nao copiar codigo desnecessariamente"). Prioridade
// de status: CANCELLED > PAID > OVERDUE > PARTIAL > OPEN. OVERDUE nunca e
// escrito no banco -- sempre calculado a partir de dueDate + "agora", para
// nunca depender de um job que reescreva status quando o tempo passa.
export interface BalanceStatusValues<TStatus extends string> {
  open: TStatus;
  partial: TStatus;
  paid: TStatus;
  cancelled: TStatus;
}

// Estado ESCRITO (nunca OVERDUE) -- recalculado a cada pagamento, dentro
// da mesma transacao que grava o pagamento.
export function computeWrittenBalanceStatus<TStatus extends string>(
  originalAmount: number,
  paidAmount: number,
  cancelledAt: Date | null,
  values: BalanceStatusValues<TStatus>,
): TStatus {
  if (cancelledAt) return values.cancelled;
  if (originalAmount > 0 && paidAmount >= originalAmount) return values.paid;
  if (paidAmount > 0) return values.partial;
  return values.open;
}

// Estado EFETIVO exibido ao usuario -- unica funcao que pode retornar
// OVERDUE. Nunca "vencido" quando ja PAID ou CANCELLED.
export function computeEffectiveBalanceStatus<TStatus extends string>(
  status: TStatus,
  dueDate: Date,
  values: BalanceStatusValues<TStatus>,
  now: Date = new Date(),
): TStatus | 'OVERDUE' {
  if (status === values.cancelled || status === values.paid) return status;
  if (dueDate.getTime() < now.getTime()) return 'OVERDUE';
  return status;
}

// Traduz o filtro ?status= para os campos Prisma equivalentes (nunca busca
// tudo e filtra em memoria). Retorno generico -- cada modulo faz o cast
// para o seu proprio Prisma.XWhereInput (mesma forma estrutural sempre:
// { status, dueDate? }).
export function buildBalanceStatusWhereFields<TStatus extends string>(
  status: TStatus | 'OVERDUE',
  values: BalanceStatusValues<TStatus>,
  now: Date = new Date(),
): { status?: TStatus | { in: TStatus[] }; dueDate?: { lt: Date } | { gte: Date } } {
  if (status === values.cancelled) return { status: values.cancelled };
  if (status === values.paid) return { status: values.paid };
  if (status === 'OVERDUE') return { status: { in: [values.open, values.partial] }, dueDate: { lt: now } };
  if (status === values.open) return { status: values.open, dueDate: { gte: now } };
  if (status === values.partial) return { status: values.partial, dueDate: { gte: now } };
  return {};
}

export function computeBalance(originalAmount: number, paidAmount: number): number {
  return Math.max(round2(originalAmount - paidAmount), 0);
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
