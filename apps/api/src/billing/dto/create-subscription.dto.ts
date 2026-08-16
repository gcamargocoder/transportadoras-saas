import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingPeriodicity, SubscriptionPaymentMethod, TenantPlanTier } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

// Fase 50 -- POST /billing/subscriptions (SUPER_ADMIN). nextDueDate NAO e
// recebido do cliente -- sempre calculado no backend (computeFirstDueDate)
// a partir de startDate/dueDay, nunca confiado ao frontend (datas
// financeiras sao sempre autoridade do backend).
export class CreateSubscriptionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tenantId!: string;

  @ApiProperty({ enum: TenantPlanTier, description: 'Tier comercial sendo cobrado (independente do TenantPlan.tier atual).' })
  @IsEnum(TenantPlanTier, { message: 'planTier invalido.' })
  planTier!: TenantPlanTier;

  @ApiProperty({ example: 499.9 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiProperty({ enum: BillingPeriodicity })
  @IsEnum(BillingPeriodicity, { message: 'periodicity invalida.' })
  periodicity!: BillingPeriodicity;

  @ApiProperty({ enum: SubscriptionPaymentMethod })
  @IsEnum(SubscriptionPaymentMethod, { message: 'paymentMethod invalido.' })
  paymentMethod!: SubscriptionPaymentMethod;

  @ApiProperty({ description: 'Data de inicio da assinatura (ISO 8601).' })
  @IsDateString({}, { message: 'startDate deve ser uma data valida (ISO 8601).' })
  startDate!: string;

  @ApiProperty({ minimum: 1, maximum: 31, description: 'Dia do mes de vencimento.' })
  @IsInt()
  @Min(1)
  @Max(31)
  dueDay!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
