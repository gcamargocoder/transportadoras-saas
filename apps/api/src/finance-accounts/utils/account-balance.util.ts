import { FinancialTransactionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Fase 78, secao 3 -- o saldo NUNCA e materializado em FinancialAccount:
// sempre initialBalance + SUM(CREDIT) - SUM(DEBIT), calculado aqui. Unica
// consulta (groupBy) para QUALQUER quantidade de contas -- nunca 1 query por
// conta (secao 7/21 do pedido: sem N+1). Reaproveitado por
// FinancialAccountsService (lista/detalhe) e FinancialAccountsDashboardService
// (KPIs), para nao duplicar essa mesma logica em dois lugares.
export async function sumTransactionsByAccount(
  prisma: PrismaService,
  tenantId: string,
  accountIds: string[],
): Promise<Map<string, { credit: number; debit: number }>> {
  const sums = new Map<string, { credit: number; debit: number }>();
  if (accountIds.length === 0) return sums;

  const grouped = await prisma.financialTransaction.groupBy({
    by: ['accountId', 'type'],
    where: { tenantId, accountId: { in: accountIds } },
    _sum: { amount: true },
  });

  for (const row of grouped) {
    const entry = sums.get(row.accountId) ?? { credit: 0, debit: 0 };
    const amount = row._sum.amount?.toNumber() ?? 0;
    if (row.type === FinancialTransactionType.CREDIT) {
      entry.credit += amount;
    } else {
      entry.debit += amount;
    }
    sums.set(row.accountId, entry);
  }

  return sums;
}

export function computeCurrentBalance(initialBalance: number, sums: { credit: number; debit: number } | undefined): number {
  const credit = sums?.credit ?? 0;
  const debit = sums?.debit ?? 0;
  return initialBalance + credit - debit;
}
