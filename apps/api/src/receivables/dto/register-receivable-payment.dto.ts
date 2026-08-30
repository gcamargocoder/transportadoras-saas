import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReceivablePaymentMethod } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min, MaxLength } from 'class-validator';

// POST /receivables/:id/payments -- amount sempre validado no backend
// contra o saldo em aberto (nunca receivedAmount > originalAmount, secao
// 4/9), nunca confiado ao DTO.
export class RegisterReceivablePaymentDto {
  @ApiProperty({ description: 'Valor recebido. Nunca pode ultrapassar o saldo em aberto.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiProperty({ example: '2026-09-10' })
  @IsDateString()
  paymentDate!: string;

  @ApiProperty({ enum: ReceivablePaymentMethod })
  @IsEnum(ReceivablePaymentMethod, { message: 'paymentMethod invalido.' })
  paymentMethod!: ReceivablePaymentMethod;

  // Fase 79, secao 3 -- exigido, sempre explicito: nunca escolhido
  // automaticamente (primeira conta, conta BANK/CASH arbitraria etc).
  @ApiProperty({ format: 'uuid', description: 'Conta financeira (FinancialAccount) onde o recebimento efetivamente entrou.' })
  @IsUUID()
  financialAccountId!: string;

  @ApiPropertyOptional({ description: 'Numero do comprovante/transacao.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  // Sempre digitados manualmente -- nunca calculados a partir de uma taxa
  // (o projeto nao possui regra de juros/multa definida). amount +
  // discountAmount quitam o titulo (somam em receivedAmount); amount +
  // interestAmount + fineAmount e o valor real movimentado na conta
  // financeira (o desconto nao movimenta caixa).
  @ApiPropertyOptional({ description: 'Juros recebidos alem do valor do titulo (nao abate o saldo, soma ao valor movimentado em caixa).' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  interestAmount?: number;

  @ApiPropertyOptional({ description: 'Multa recebida alem do valor do titulo (nao abate o saldo, soma ao valor movimentado em caixa).' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fineAmount?: number;

  @ApiPropertyOptional({ description: 'Desconto concedido no recebimento (abate o saldo junto com amount, mas nao movimenta caixa).' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;
}
