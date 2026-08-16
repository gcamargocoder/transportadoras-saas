import { ApiPropertyOptional } from '@nestjs/swagger';
import { BillingPeriodicity, SubscriptionPaymentMethod, SubscriptionStatus, TenantPlanTier } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min } from 'class-validator';

// Fase 50 -- PATCH /billing/subscriptions/:id (SUPER_ADMIN). Atualizacao
// parcial (mesmo padrao de UpdateTenantPlanDto) -- so os campos enviados
// sao alterados. `nextDueDate` aqui e a via explicita de "alterar
// vencimento" (secao 4 do pedido) -- distinto do avanco automatico feito
// ao registrar um pagamento PAID.
export class UpdateSubscriptionDto {
  @ApiPropertyOptional({ enum: TenantPlanTier })
  @IsOptional()
  @IsEnum(TenantPlanTier, { message: 'planTier invalido.' })
  planTier?: TenantPlanTier;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({ enum: BillingPeriodicity })
  @IsOptional()
  @IsEnum(BillingPeriodicity, { message: 'periodicity invalida.' })
  periodicity?: BillingPeriodicity;

  @ApiPropertyOptional({ enum: SubscriptionPaymentMethod })
  @IsOptional()
  @IsEnum(SubscriptionPaymentMethod, { message: 'paymentMethod invalido.' })
  paymentMethod?: SubscriptionPaymentMethod;

  @ApiPropertyOptional({ minimum: 1, maximum: 31 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dueDay?: number;

  @ApiPropertyOptional({ description: 'Corrige manualmente o proximo vencimento (ISO 8601).' })
  @IsOptional()
  @IsDateString({}, { message: 'nextDueDate deve ser uma data valida (ISO 8601).' })
  nextDueDate?: string;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus, { message: 'status invalido.' })
  status?: SubscriptionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
