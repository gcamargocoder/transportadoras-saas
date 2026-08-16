import { BillingPeriodicity } from '@prisma/client';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Fase 50 -- calculo do proximo vencimento, sempre em UTC (Date.UTC),
// nunca depende do timezone da maquina que roda o codigo -- evita o
// tenant "perder" ou "ganhar" um dia por causa do fuso do servidor.
// `dueDay` e clampado ao ultimo dia do mes de destino (ex: dueDay=31 numa
// periodicidade mensal cai em fevereiro -> vira dia 28/29).
export function computeNextDueDate(
  currentDueDate: Date,
  periodicity: BillingPeriodicity,
  dueDay: number,
): Date {
  const monthsToAdd = periodicity === 'MONTHLY' ? 1 : 12;
  const year = currentDueDate.getUTCFullYear();
  const month = currentDueDate.getUTCMonth();

  const targetMonthIndex = month + monthsToAdd;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;

  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(dueDay, daysInTargetMonth);

  return new Date(Date.UTC(targetYear, targetMonth, day, 0, 0, 0, 0));
}

// Fase 50 -- 1o vencimento de uma assinatura nova: o dueDay dentro do mes
// de startDate, clampado; se essa data ja tiver passado em relacao a
// startDate, rola para o mes seguinte (mesma regra de clamp de
// computeNextDueDate). Sempre UTC.
export function computeFirstDueDate(startDate: Date, dueDay: number): Date {
  const year = startDate.getUTCFullYear();
  const month = startDate.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(dueDay, daysInMonth);
  const candidate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  const startOfStartDate = new Date(Date.UTC(year, month, startDate.getUTCDate(), 0, 0, 0, 0));

  if (candidate.getTime() >= startOfStartDate.getTime()) {
    return candidate;
  }
  return computeNextDueDate(candidate, 'MONTHLY', dueDay);
}

// Dias em atraso (sempre >= 0) -- `now` injetavel para testes controlarem
// a data sem sleep real; autoridade de tempo e sempre o backend.
export function daysOverdue(dueDate: Date, now: Date = new Date()): number {
  const diff = Math.floor((now.getTime() - dueDate.getTime()) / MS_PER_DAY);
  return diff > 0 ? diff : 0;
}
