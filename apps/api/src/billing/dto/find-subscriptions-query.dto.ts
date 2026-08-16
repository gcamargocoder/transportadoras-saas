import { ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionPaymentMethod, SubscriptionStatus, TenantPlanTier } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// Fase 50 -- GET /billing/subscriptions (SUPER_ADMIN). Filtros pedidos
// explicitamente: status, metodo, plano, periodo (vencimento), busca por
// transportadora. `tenantId` e um filtro adicional (nao pedido
// explicitamente, mas reaproveita esta MESMA listagem em vez de criar um
// endpoint novo) usado pela secao "Assinatura e cobranca" do detalhe do
// tenant (secao 9) para resolver a assinatura de 1 tenant especifico.
export class FindSubscriptionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Busca livre por razao social, nome fantasia ou slug da transportadora.' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus, { message: 'status invalido.' })
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ enum: SubscriptionPaymentMethod })
  @IsOptional()
  @IsEnum(SubscriptionPaymentMethod, { message: 'paymentMethod invalido.' })
  paymentMethod?: SubscriptionPaymentMethod;

  @ApiPropertyOptional({ enum: TenantPlanTier })
  @IsOptional()
  @IsEnum(TenantPlanTier, { message: 'planTier invalido.' })
  planTier?: TenantPlanTier;

  @ApiPropertyOptional({ description: 'Filtra assinaturas com proximo vencimento a partir desta data (ISO 8601).' })
  @IsOptional()
  @IsDateString({}, { message: 'dueFrom deve ser uma data valida (ISO 8601).' })
  dueFrom?: string;

  @ApiPropertyOptional({ description: 'Filtra assinaturas com proximo vencimento ate esta data (ISO 8601).' })
  @IsOptional()
  @IsDateString({}, { message: 'dueTo deve ser uma data valida (ISO 8601).' })
  dueTo?: string;
}
