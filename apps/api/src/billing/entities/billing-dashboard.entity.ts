import { ApiProperty } from '@nestjs/swagger';

export class UpcomingDueEntity {
  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  tenantName!: string;

  @ApiProperty()
  amount!: number;

  @ApiProperty()
  nextDueDate!: Date;
}

// Fase 50 -- GET /billing/dashboard. Sempre agregacao real (count/groupBy/
// aggregate em paralelo), nunca 1 query por assinatura -- mesmo padrao de
// PlatformDashboardEntity (Fase 47).
export class BillingDashboardEntity {
  @ApiProperty({ description: 'Soma de amount das assinaturas ACTIVE, normalizada para valor mensal (YEARLY / 12).' })
  monthlyProjectedRevenue!: number;

  @ApiProperty({ description: 'Soma de amount das assinaturas ACTIVE, normalizada para valor anual (MONTHLY * 12).' })
  annualProjectedRevenue!: number;

  @ApiProperty({ description: 'Soma de SubscriptionPayment.amount com status=PAID no periodo consultado.' })
  receivedInPeriod!: number;

  @ApiProperty({ description: 'Soma de amount das assinaturas com status PENDING.' })
  pendingAmount!: number;

  @ApiProperty({ description: 'Soma de amount das assinaturas com status OVERDUE.' })
  overdueAmount!: number;

  @ApiProperty()
  activeSubscriptions!: number;

  @ApiProperty()
  totalSubscriptions!: number;

  @ApiProperty()
  overdueSubscriptions!: number;

  @ApiProperty({ type: [UpcomingDueEntity] })
  upcomingDueDates!: UpcomingDueEntity[];
}
