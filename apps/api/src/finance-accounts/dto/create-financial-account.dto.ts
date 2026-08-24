import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FinancialAccountType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min, MaxLength, MinLength } from 'class-validator';

// POST /finance/accounts -- secao 2/5 do pedido: initialBalance e fixado
// aqui e nunca alterado depois (nao existe campo para editar em
// UpdateFinancialAccountDto). Nunca aceitar credencial bancaria (senha,
// token, chave de API) -- somente identificacao opcional.
export class CreateFinancialAccountDto {
  @ApiProperty({ example: 'Banco do Brasil - Conta Corrente' })
  @IsString()
  @MinLength(2, { message: 'name e obrigatorio.' })
  @MaxLength(150)
  name!: string;

  @ApiProperty({ enum: FinancialAccountType })
  @IsEnum(FinancialAccountType, { message: 'type invalido.' })
  type!: FinancialAccountType;

  @ApiPropertyOptional({ default: 0, description: 'Saldo conhecido no momento do cadastro. Nunca alterado depois.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'initialBalance nao pode ser negativo no cadastro.' })
  initialBalance?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bankCode?: string;

  @ApiPropertyOptional({ description: 'Numero da conta ja mascarado (ex: ****1234). Nunca dado sensivel completo.' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountNumberMasked?: string;
}
