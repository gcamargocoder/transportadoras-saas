import { ApiProperty } from '@nestjs/swagger';
import {
  BillingPeriodicity,
  SubscriptionPaymentMethod,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
  TenantPlanTier,
} from '@prisma/client';

// Fase 50 -- representacao da relacao comercial de um tenant. `daysOverdue`
// e sempre calculado no backend (billing-date.util.ts), nunca no cliente.
// `lastPaymentAt`/`lastPaymentStatus` so vem preenchidos quando o service
// resolve o ultimo pagamento (findById -- detalhe de 1 assinatura); a
// listagem paginada nao resolve isso por linha (evita N+1).
export class SubscriptionEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  tenantName!: string;

  @ApiProperty({ enum: TenantPlanTier })
  planTier!: TenantPlanTier;

  @ApiProperty()
  amount!: number;

  @ApiProperty({ enum: BillingPeriodicity })
  periodicity!: BillingPeriodicity;

  @ApiProperty({ enum: SubscriptionPaymentMethod })
  paymentMethod!: SubscriptionPaymentMethod;

  @ApiProperty()
  startDate!: Date;

  @ApiProperty()
  dueDay!: number;

  @ApiProperty()
  nextDueDate!: Date;

  @ApiProperty({ enum: SubscriptionStatus })
  status!: SubscriptionStatus;

  @ApiProperty({ description: 'Dias em atraso a partir de nextDueDate (0 quando nao esta vencido).' })
  daysOverdue!: number;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ nullable: true, description: 'So preenchido no detalhe (GET /billing/subscriptions/:id).' })
  lastPaymentAt!: Date | null;

  @ApiProperty({ enum: SubscriptionPaymentStatus, nullable: true })
  lastPaymentStatus!: SubscriptionPaymentStatus | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
