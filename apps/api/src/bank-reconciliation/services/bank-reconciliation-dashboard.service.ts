import { Injectable } from '@nestjs/common';
import { FinancialBankTransactionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FindBankReconciliationDashboardQueryDto } from '../dto/find-bank-reconciliation-dashboard-query.dto';
import { BankReconciliationDashboardEntity } from '../entities/bank-reconciliation-dashboard.entity';

// GET /finance/bank-transactions/dashboard -- secao 11: 1 unica query
// (groupBy por status), nunca 1 por movimentacao. NUNCA calcula saldo --
// so contagens/somas das PROPRIAS BankTransaction (saldo oficial continua
// sendo FinancialAccount + FinancialTransaction, Fase 78).
@Injectable()
export class BankReconciliationDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(tenantId: string, query: FindBankReconciliationDashboardQueryDto): Promise<BankReconciliationDashboardEntity> {
    const where: Prisma.FinancialBankTransactionWhereInput = {
      tenantId,
      ...(query.financialAccountId ? { financialAccountId: query.financialAccountId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const grouped = await this.prisma.financialBankTransaction.groupBy({
      by: ['status'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });

    const byStatus = new Map(grouped.map((row) => [row.status, row]));
    const countOf = (status: FinancialBankTransactionStatus) => byStatus.get(status)?._count._all ?? 0;
    const amountOf = (status: FinancialBankTransactionStatus) => byStatus.get(status)?._sum.amount?.toNumber() ?? 0;

    const result = new BankReconciliationDashboardEntity();
    result.matchedCount = countOf(FinancialBankTransactionStatus.MATCHED);
    result.pendingCount = countOf(FinancialBankTransactionStatus.PENDING);
    result.divergentCount = countOf(FinancialBankTransactionStatus.DIVERGENT);
    result.totalCount = result.matchedCount + result.pendingCount + result.divergentCount;
    result.matchedAmount = amountOf(FinancialBankTransactionStatus.MATCHED);
    result.pendingAmount = amountOf(FinancialBankTransactionStatus.PENDING);
    result.divergentAmount = amountOf(FinancialBankTransactionStatus.DIVERGENT);
    return result;
  }
}
