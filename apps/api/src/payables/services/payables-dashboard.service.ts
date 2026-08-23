import { Injectable } from '@nestjs/common';
import { ExpenseCategory, PayableStatus, Prisma } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { PrismaService } from '../../prisma/prisma.service';
import { FindPayablesDashboardQueryDto } from '../dto/find-payables-dashboard-query.dto';
import {
  PayablesAgingBucketEntity,
  PayablesByCategoryEntity,
  PayablesDashboardEntity,
  PayablesDashboardSummaryEntity,
} from '../entities/payables-dashboard.entity';
import { computeBalance, round2 } from '../utils/payable-status.util';

const DASHBOARD_ROW_SELECT = {
  id: true,
  category: true,
  originalAmount: true,
  paidAmount: true,
  dueDate: true,
  status: true,
} satisfies Prisma.PayableSelect;

type DashboardRow = Prisma.PayableGetPayload<{ select: typeof DASHBOARD_ROW_SELECT }>;

const AGING_LABELS = ['A vencer', '1-30 dias', '31-60 dias', '61-90 dias', '91+ dias'] as const;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Fase 73, secao 11/12/13/23 -- 1 UNICA query traz todo o escopo (nunca 1
// por categoria/despesa/viagem); todo o resto e agregado em memoria a
// partir do mesmo lote, mesmo padrao ja usado por
// ReceivablesDashboardService (Fase 72) e BillingDashboardService (Fase 60).
@Injectable()
export class PayablesDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(tenantId: string, query: FindPayablesDashboardQueryDto): Promise<PayablesDashboardEntity> {
    const where: Prisma.PayableWhereInput = {
      tenantId,
      ...(query.tripId ? { tripId: query.tripId } : {}),
      ...(query.from || query.to
        ? {
            issueDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const rows: DashboardRow[] = await this.prisma.payable.findMany({ where, select: DASHBOARD_ROW_SELECT });
    const now = new Date();

    const entity = new PayablesDashboardEntity();
    entity.summary = this.buildSummary(rows, now);
    entity.aging = this.buildAging(rows, now);
    entity.byCategory = this.buildByCategory(rows);
    return entity;
  }

  private buildSummary(rows: DashboardRow[], now: Date): PayablesDashboardSummaryEntity {
    const summary = new PayablesDashboardSummaryEntity();
    summary.totalPayable = 0;
    summary.totalPaid = 0;
    summary.totalOpen = 0;
    summary.totalOverdue = 0;
    summary.totalUpcoming = 0;
    summary.openCount = 0;
    summary.overdueCount = 0;
    summary.paidCount = 0;
    summary.cancelledCount = 0;

    for (const row of rows) {
      if (row.status === PayableStatus.CANCELLED) {
        summary.cancelledCount += 1;
        continue;
      }
      const originalAmount = toNumberOrNull(row.originalAmount) ?? 0;
      const paidAmount = toNumberOrNull(row.paidAmount) ?? 0;
      summary.totalPayable += originalAmount;
      summary.totalPaid += paidAmount;

      if (row.status === PayableStatus.PAID) {
        summary.paidCount += 1;
        continue;
      }
      const balance = computeBalance(originalAmount, paidAmount);
      summary.totalOpen += balance;
      if (row.dueDate.getTime() < now.getTime()) {
        summary.totalOverdue += balance;
        summary.overdueCount += 1;
      } else {
        summary.totalUpcoming += balance;
        summary.openCount += 1;
      }
    }

    summary.totalPayable = round2(summary.totalPayable);
    summary.totalPaid = round2(summary.totalPaid);
    summary.totalOpen = round2(summary.totalOpen);
    summary.totalOverdue = round2(summary.totalOverdue);
    summary.totalUpcoming = round2(summary.totalUpcoming);
    return summary;
  }

  private buildAging(rows: DashboardRow[], now: Date): PayablesAgingBucketEntity[] {
    const buckets = AGING_LABELS.map((label) => {
      const entity = new PayablesAgingBucketEntity();
      entity.label = label;
      entity.amount = 0;
      entity.count = 0;
      return entity;
    });

    for (const row of rows) {
      if (row.status === PayableStatus.CANCELLED || row.status === PayableStatus.PAID) continue;
      const originalAmount = toNumberOrNull(row.originalAmount) ?? 0;
      const paidAmount = toNumberOrNull(row.paidAmount) ?? 0;
      const balance = computeBalance(originalAmount, paidAmount);
      if (balance <= 0) continue;

      const daysOverdue = Math.floor((now.getTime() - row.dueDate.getTime()) / MS_PER_DAY);
      const bucketIndex = daysOverdue <= 0 ? 0 : daysOverdue <= 30 ? 1 : daysOverdue <= 60 ? 2 : daysOverdue <= 90 ? 3 : 4;
      const bucket = buckets[bucketIndex]!;
      bucket.amount = round2(bucket.amount + balance);
      bucket.count += 1;
    }

    return buckets;
  }

  private buildByCategory(rows: DashboardRow[]): PayablesByCategoryEntity[] {
    const grouped = new Map<ExpenseCategory, { payable: number; paid: number }>();

    for (const row of rows) {
      if (row.status === PayableStatus.CANCELLED) continue;
      const originalAmount = toNumberOrNull(row.originalAmount) ?? 0;
      const paidAmount = toNumberOrNull(row.paidAmount) ?? 0;

      const existing = grouped.get(row.category);
      if (existing) {
        existing.payable += originalAmount;
        existing.paid += paidAmount;
      } else {
        grouped.set(row.category, { payable: originalAmount, paid: paidAmount });
      }
    }

    return [...grouped.entries()]
      .sort((a, b) => b[1].payable - a[1].payable)
      .map(([category, data]) => {
        const entity = new PayablesByCategoryEntity();
        entity.category = category;
        entity.totalPayable = round2(data.payable);
        entity.totalPaid = round2(data.paid);
        entity.balance = round2(data.payable - data.paid);
        return entity;
      });
  }
}
