import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

// Fase 83, secao 3 -- correcao de saldo (contagem de inventario, avaria,
// erro de lancamento anterior). `quantity` e o DELTA com sinal (positivo =
// correcao para cima, negativo = para baixo) -- nunca substitui o saldo
// diretamente, sempre soma/subtrai via uma nova movimentacao (append-only).
// `reason` e obrigatorio (diferente de IN/OUT): um ajuste sem justificativa
// documentada nao deveria existir no ledger.
export class RegisterStockAdjustmentDto {
  @ApiProperty({ example: -1, description: 'Delta com sinal (positivo = para cima, negativo = para baixo).' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsNotEmpty()
  quantity!: number;

  @ApiProperty({ example: 'Contagem de inventario -- divergencia encontrada.' })
  @IsString()
  @MaxLength(300)
  reason!: string;

  @ApiPropertyOptional({ example: '2026-08-20', description: 'Data do movimento (default: agora).' })
  @IsOptional()
  @IsDateString({}, { message: 'movementDate deve ser uma data valida (ISO 8601).' })
  movementDate?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
