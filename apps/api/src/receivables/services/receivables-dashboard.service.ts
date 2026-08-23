import { Injectable } from '@nestjs/common';
import { Prisma, ReceivableStatus } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { PrismaService } from '../../prisma/prisma.service';
import { FindReceivablesDashboardQueryDto } from '../dto/find-receivables-dashboard-query.dto';
import {
  ReceivablesAgingBucketEntity,
  ReceivablesByCustomerEntity,
  ReceivablesDashboardEntity,
  ReceivablesDashboardSummaryEntity,
} from '../entities/receivables-dashboard.entity';
import { computeBalance, round2 } from '../utils/receivable-status.util';

const DASHBOARD_ROW_SELECT = {
  id: true,
  customerId: true,
  customer: { select: { name: true } },
  originalAmount: true,
  receivedAmount: true,
  dueDate: true,
  status: true,
} satisfies Prisma.ReceivableSelect;

type DashboardRow = Prisma.ReceivableGetPayload<{ select: typeof DASHBOARD_ROW_SELECT }>;

const AGING_LABELS = ['A vencer', '1-30 dias', '31-60 dias', '61-90 dias', '91+ dias'] as const;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Fase 72, secao 11/12/13/23 -- 1 UNICA query traz todo o escopo (nunca 1
// por cliente/titulo/viagem); todo o resto (resumo, aging, por cliente) e
// agregado em memoria a partir do mesmo lote, mesmo padrao ja usado por
// BillingDashboardService (Fase 60) -- nunca duplicado, mesma tecnica.
@Injectable()
export class ReceivablesDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(tenantId: string, query: FindReceivablesDashboardQueryDto): Promise<ReceivablesDashboardEntity> {
    const where: Prisma.ReceivableWhereInput = {
      tenantId,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.from || query.to
        ? {
            issueDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const rows: DashboardRow[] = await this.prisma.receivable.findMany({ where, select: DASHBOARD_ROW_SELECT });
    const now = new Date();

    const entity = new ReceivablesDashboardEntity();
    entity.summary = this.buildSummary(rows, now);
    entity.aging = this.buildAging(rows, now);
    entity.byCustomer = this.buildByCustomer(rows, now);
    return entity;
  }

  private buildSummary(rows: DashboardRow[], now: Date): ReceivablesDashboardSummaryEntity {
    const summary = new ReceivablesDashboardSummaryEntity();
    summary.totalInvoiced = 0;
    summary.totalReceived = 0;
    summary.totalOpen = 0;
    summary.totalOverdue = 0;
    summary.totalUpcoming = 0;
    summary.openCount = 0;
    summary.overdueCount = 0;
    summary.paidCount = 0;
    summary.cancelledCount = 0;

    for (const row of rows) {
      if (row.status === ReceivableStatus.CANCELLED) {
        summary.cancelledCount += 1;
        continue;
      }
      const originalAmount = toNumberOrNull(row.originalAmount) ?? 0;
      const receivedAmount = toNumberOrNull(row.receivedAmount) ?? 0;
      summary.totalInvoiced += originalAmount;
      summary.totalReceived += receivedAmount;

      if (row.status === ReceivableStatus.PAID) {
        summary.paidCount += 1;
        continue;
      }
      const balance = computeBalance(originalAmount, receivedAmount);
      summary.totalOpen += balance;
      if (row.dueDate.getTime() < now.getTime()) {
        summary.totalOverdue += balance;
        summary.overdueCount += 1;
      } else {
        summary.totalUpcoming += balance;
        summary.openCount += 1;
      }
    }

    summary.totalInvoiced = round2(summary.totalInvoiced);
    summary.totalReceived = round2(summary.totalReceived);
    summary.totalOpen = round2(summary.totalOpen);
    summary.totalOverdue = round2(summary.totalOverdue);
    summary.totalUpcoming = round2(summary.totalUpcoming);
    return summary;
  }

  private buildAging(rows: DashboardRow[], now: Date): ReceivablesAgingBucketEntity[] {
    const buckets = AGING_LABELS.map((label) => {
      const entity = new ReceivablesAgingBucketEntity();
      entity.label = label;
      entity.amount = 0;
      entity.count = 0;
      return entity;
    });

    for (const row of rows) {
      if (row.status === ReceivableStatus.CANCELLED || row.status === ReceivableStatus.PAID) continue;
      const originalAmount = toNumberOrNull(row.originalAmount) ?? 0;
      const receivedAmount = toNumberOrNull(row.receivedAmount) ?? 0;
      const balance = computeBalance(originalAmount, receivedAmount);
      if (balance <= 0) continue;

      const daysOverdue = Math.floor((now.getTime() - row.dueDate.getTime()) / MS_PER_DAY);
      const bucketIndex = daysOverdue <= 0 ? 0 : daysOverdue <= 30 ? 1 : daysOverdue <= 60 ? 2 : daysOverdue <= 90 ? 3 : 4;
      const bucket = buckets[bucketIndex]!;
      bucket.amount = round2(bucket.amount + balance);
      bucket.count += 1;
    }

    return buckets;
  }

  private buildByCustomer(rows: DashboardRow[], now: Date): ReceivablesByCustomerEntity[] {
    const grouped = new Map<string, { name: string; invoiced: number; received: number; overdue: number }>();

    for (const row of rows) {
      if (row.status === ReceivableStatus.CANCELLED) continue;
      const key = row.customerId ?? '__no_customer__';
      const originalAmount = toNumberOrNull(row.originalAmount) ?? 0;
      const receivedAmount = toNumberOrNull(row.receivedAmount) ?? 0;
      const balance = computeBalance(originalAmount, receivedAmount);
      const isOverdue = row.status !== ReceivableStatus.PAID && balance > 0 && row.dueDate.getTime() < now.getTime();

      const existing = grouped.get(key);
      if (existing) {
        existing.invoiced += originalAmount;
        existing.received += receivedAmount;
        existing.overdue += isOverdue ? balance : 0;
      } else {
        grouped.set(key, {
          name: row.customer?.name ?? 'Sem cliente',
          invoiced: originalAmount,
          received: receivedAmount,
          overdue: isOverdue ? balance : 0,
        });
      }
    }

    return [...grouped.entries()]
      .sort((a, b) => b[1].invoiced - a[1].invoiced)
      .map(([customerId, data]) => {
        const entity = new ReceivablesByCustomerEntity();
        entity.customerId = customerId === '__no_customer__' ? null : customerId;
        entity.customerName = data.name;
        entity.totalInvoiced = round2(data.invoiced);
        entity.totalReceived = round2(data.received);
        entity.balance = round2(data.invoiced - data.received);
        entity.overdueAmount = round2(data.overdue);
        return entity;
      });
  }
}
