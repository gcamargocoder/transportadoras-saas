import { Injectable } from '@nestjs/common';
import { FinancialAccountType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FinancialAccountsDashboardEntity } from '../entities/financial-accounts-dashboard.entity';
import { computeCurrentBalance, sumTransactionsByAccount } from '../utils/account-balance.util';

// GET /finance/accounts/dashboard (Fase 78, secao 14) -- visao ATUAL, sem
// evolucao temporal. Exatamente 2 queries no total (1 findMany + 1 groupBy),
// independente da quantidade de contas -- nunca 1 query por conta.
@Injectable()
export class FinancialAccountsDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(tenantId: string): Promise<FinancialAccountsDashboardEntity> {
    const accounts = await this.prisma.financialAccount.findMany({
      where: { tenantId },
      select: { id: true, type: true, initialBalance: true, isActive: true },
    });

    const sums = await sumTransactionsByAccount(this.prisma, tenantId, accounts.map((account) => account.id));

    const result = new FinancialAccountsDashboardEntity();
    result.totalBalance = 0;
    result.totalBankBalance = 0;
    result.totalCashBalance = 0;
    result.activeAccounts = 0;
    result.inactiveAccounts = 0;

    for (const account of accounts) {
      const balance = computeCurrentBalance(account.initialBalance.toNumber(), sums.get(account.id));
      result.totalBalance += balance;
      if (account.type === FinancialAccountType.BANK) {
        result.totalBankBalance += balance;
      } else {
        result.totalCashBalance += balance;
      }
      if (account.isActive) {
        result.activeAccounts += 1;
      } else {
        result.inactiveAccounts += 1;
      }
    }

    return result;
  }
}
