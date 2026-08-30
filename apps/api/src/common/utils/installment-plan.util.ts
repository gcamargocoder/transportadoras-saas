import { round2 } from './balance-status.util';

// Fase Financeiro CP/CR -- calculo de parcelamento COMPARTILHADO entre
// PayablesService.create e ReceivablesService.create (mesma regra para os
// dois lados, nunca duplicada): originalAmount dividido igualmente entre N
// parcelas, ultima parcela absorve o resto do arredondamento (para que a
// soma das parcelas seja sempre exatamente originalAmount, nunca a mais ou
// a menos por causa de centavos). Vencimentos: 1a parcela = firstDueDate,
// demais somam 1 mes cada, com o dia clampado ao ultimo dia do mes de
// destino quando o mes de origem nao existe no destino (ex: 31/01 + 1 mes
// = 28/02 ou 29/02, nunca "03/03").
export interface InstallmentPlanEntry {
  amount: number;
  dueDate: Date;
}

export function buildInstallmentPlan(originalAmount: number, firstDueDate: Date, installments = 1): InstallmentPlanEntry[] {
  const count = Math.max(1, Math.trunc(installments));
  if (count === 1) {
    return [{ amount: round2(originalAmount), dueDate: firstDueDate }];
  }

  const base = round2(originalAmount / count);
  const plan: InstallmentPlanEntry[] = [];
  let accumulated = 0;
  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    const amount = isLast ? round2(originalAmount - accumulated) : base;
    accumulated = round2(accumulated + amount);
    plan.push({ amount, dueDate: addMonthsClamped(firstDueDate, i) });
  }
  return plan;
}

function addMonthsClamped(date: Date, monthsToAdd: number): Date {
  if (monthsToAdd === 0) return date;
  const day = date.getUTCDate();
  const targetMonthFirstDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthsToAdd, 1));
  const lastDayOfTargetMonth = new Date(Date.UTC(targetMonthFirstDay.getUTCFullYear(), targetMonthFirstDay.getUTCMonth() + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);
  return new Date(
    Date.UTC(
      targetMonthFirstDay.getUTCFullYear(),
      targetMonthFirstDay.getUTCMonth(),
      clampedDay,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}
