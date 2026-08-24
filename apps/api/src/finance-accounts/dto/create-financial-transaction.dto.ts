import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FinancialTransactionType } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';

// POST /finance/accounts/:id/transactions -- secao 6 do pedido: ajuste
// manual de credito/debito. amount SEMPRE positivo -- o sentido e definido
// por `type` (nunca um valor negativo). Saldo negativo e permitido (secao 6:
// "por padrao, saldo negativo deve ser permitido"), o projeto nao possui
// conceito de limite/cheque especial.
export class CreateFinancialTransactionDto {
  @ApiProperty({ enum: FinancialTransactionType })
  @IsEnum(FinancialTransactionType, { message: 'type invalido.' })
  type!: FinancialTransactionType;

  @ApiProperty({ description: 'Sempre positivo -- o sentido (credito/debito) e definido por type.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiProperty({ example: '2026-08-24' })
  @IsDateString()
  transactionDate!: string;

  @ApiProperty({ example: 'Deposito de cliente' })
  @IsString()
  @MinLength(2, { message: 'description e obrigatoria.' })
  @MaxLength(500)
  description!: string;

  @ApiPropertyOptional({ description: 'Vinculo futuro com outra entidade (ex: Receivable). Nunca preenchido automaticamente nesta fase.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceType?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceId?: string;
}
