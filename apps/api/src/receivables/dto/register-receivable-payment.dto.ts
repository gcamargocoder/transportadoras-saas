import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReceivablePaymentMethod } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';

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
}
