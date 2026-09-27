import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';

// Campos permitidos para edicao (secao 1 da Fase 1): NUNCA capacityLiters,
// initialStockLiters, currentStockLiters ou fuelType -- alterar a
// capacidade/tipo de um tanque em operacao exigiria reconciliar o estoque
// ja movimentado, fora do escopo desta fase (mesmo espirito de
// UpdatePartDto nunca aceitar currentStock).
export class UpdateFuelTankDto {
  @ApiPropertyOptional({ example: 'Tanque matriz -- patio central' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ example: 2000, description: 'Estoque minimo -- usado para calcular estoque baixo.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0, { message: 'minStockLiters nao pode ser negativo.' })
  minStockLiters?: number;

  @ApiPropertyOptional({ example: 'Patio central -- filial Sao Paulo' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;
}
