import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpensePaymentMethod } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';

// POST /payables/:id/payments -- amount sempre validado no backend contra
// o saldo em aberto (nunca paidAmount > originalAmount). paymentMethod
// reaproveita ExpensePaymentMethod (ja usado em TripExpense) -- nenhum
// enum paralelo.
export class RegisterPayablePaymentDto {
  @ApiProperty({ description: 'Valor pago. Nunca pode ultrapassar o saldo em aberto.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiProperty({ example: '2026-09-10' })
  @IsDateString()
  paymentDate!: string;

  @ApiProperty({ enum: ExpensePaymentMethod })
  @IsEnum(ExpensePaymentMethod, { message: 'paymentMethod invalido.' })
  paymentMethod!: ExpensePaymentMethod;

  // Fase 79, secao 3 -- exigido, sempre explicito: nunca escolhido
  // automaticamente.
  @ApiProperty({ format: 'uuid', description: 'Conta financeira (FinancialAccount) de onde o pagamento efetivamente saiu.' })
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
