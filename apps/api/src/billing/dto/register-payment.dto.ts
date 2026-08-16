import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionPaymentMethod, SubscriptionPaymentStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

// Fase 50 -- POST /billing/subscriptions/:id/payments (SUPER_ADMIN). Cada
// chamada cria uma linha NOVA no historico (ledger imutavel) -- "marcar
// pagamento como pago/pendente/atrasado" (secao 4 do pedido) e sempre um
// novo registro com o status desejado, nunca uma edicao de um registro
// anterior.
export class RegisterPaymentDto {
  @ApiProperty({ example: 499.9 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiProperty({ description: 'Vencimento a que este pagamento se refere (ISO 8601).' })
  @IsDateString({}, { message: 'dueDate deve ser uma data valida (ISO 8601).' })
  dueDate!: string;

  @ApiPropertyOptional({ description: 'Data em que o pagamento foi efetivamente recebido (ISO 8601). So relevante quando status=PAID.' })
  @IsOptional()
  @IsDateString({}, { message: 'paidAt deve ser uma data valida (ISO 8601).' })
  paidAt?: string;

  @ApiProperty({ enum: SubscriptionPaymentMethod })
  @IsEnum(SubscriptionPaymentMethod, { message: 'paymentMethod invalido.' })
  paymentMethod!: SubscriptionPaymentMethod;

  @ApiProperty({ enum: SubscriptionPaymentStatus })
  @IsEnum(SubscriptionPaymentStatus, { message: 'status invalido.' })
  status!: SubscriptionPaymentStatus;

  @ApiPropertyOptional({ description: 'Referencia/observacao livre (ex: id do comprovante PIX).' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reference?: string;
}
