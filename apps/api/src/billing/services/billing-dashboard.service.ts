import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingDashboardQueryDto } from '../dto/billing-dashboard-query.dto';
import { BillingDashboardEntity, UpcomingDueEntity } from '../entities/billing-dashboard.entity';

const UPCOMING_DUE_LIMIT = 5;

// Fase 50 -- GET /billing/dashboard. Sempre Promise.all de count/groupBy/
// aggregate, nunca 1 query por assinatura (mesmo padrao de
// TenantsRepository.getPlatformStats(), Fase 47).
@Injectable()
export class BillingDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(query: BillingDashboardQueryDto): Promise<BillingDashboardEntity> {
    const now = new Date();
    const periodStart = query.from
      ? new Date(query.from)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const periodEnd = query.to ? new Date(query.to) : now;

    const [
      activeSubscriptions,
      totalSubscriptions,
      overdueSubscriptions,
      activeByPeriodicity,
      pendingAggregate,
      overdueAggregate,
      receivedAggregate,
      upcoming,
    ] = await Promise.all([
      this.prisma.tenantSubscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.tenantSubscription.count(),
      this.prisma.tenantSubscription.count({ where: { status: 'OVERDUE' } }),
      this.prisma.tenantSubscription.groupBy({
        by: ['periodicity'],
        where: { status: 'ACTIVE' },
        _sum: { amount: true },
      }),
      this.prisma.tenantSubscription.aggregate({
        where: { status: 'PENDING' },
        _sum: { amount: true },
      }),
      this.prisma.tenantSubscription.aggregate({
        where: { status: 'OVERDUE' },
        _sum: { amount: true },
      }),
      this.prisma.subscriptionPayment.aggregate({
        where: { status: 'PAID', paidAt: { gte: periodStart, lte: periodEnd } },
        _sum: { amount: true },
      }),
      this.prisma.tenantSubscription.findMany({
        where: { status: { in: ['ACTIVE', 'PENDING'] } },
        orderBy: { nextDueDate: 'asc' },
        take: UPCOMING_DUE_LIMIT,
        include: { tenant: { select: { name: true } } },
      }),
    ]);

    const monthlySum = activeByPeriodicity.find((g) => g.periodicity === 'MONTHLY')?._sum.amount?.toNumber() ?? 0;
    const yearlySum = activeByPeriodicity.find((g) => g.periodicity === 'YEARLY')?._sum.amount?.toNumber() ?? 0;

    const entity = new BillingDashboardEntity();
    entity.monthlyProjectedRevenue = monthlySum + yearlySum / 12;
    entity.annualProjectedRevenue = monthlySum * 12 + yearlySum;
    entity.receivedInPeriod = receivedAggregate._sum.amount?.toNumber() ?? 0;
    entity.pendingAmount = pendingAggregate._sum.amount?.toNumber() ?? 0;
    entity.overdueAmount = overdueAggregate._sum.amount?.toNumber() ?? 0;
    entity.activeSubscriptions = activeSubscriptions;
    entity.totalSubscriptions = totalSubscriptions;
    entity.overdueSubscriptions = overdueSubscriptions;
    entity.upcomingDueDates = upcoming.map((subscription) => {
      const item = new UpcomingDueEntity();
      item.tenantId = subscription.tenantId;
      item.tenantName = subscription.tenant.name;
      item.amount = subscription.amount.toNumber();
      item.nextDueDate = subscription.nextDueDate;
      return item;
    });

    return entity;
  }
}
