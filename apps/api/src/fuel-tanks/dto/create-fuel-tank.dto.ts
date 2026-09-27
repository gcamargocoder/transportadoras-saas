import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FuelType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';

// currentStockLiters/isLowStock NAO fazem parte deste DTO de proposito: sao
// sempre calculados pelo service (initialStockLiters vira o saldo inicial
// via a primeira FuelTankMovement, nunca aceitos prontos do cliente) --
// mesmo padrao ja usado por CreatePartDto.
export class CreateFuelTankDto {
  @ApiProperty({ example: 'Tanque matriz -- patio central' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ enum: FuelType, default: FuelType.DIESEL_S10 })
  @IsOptional()
  @IsEnum(FuelType)
  fuelType?: FuelType;

  @ApiProperty({ example: 15000, description: 'Capacidade fisica do tanque, em litros. Deve ser maior que zero.' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001, { message: 'capacityLiters deve ser maior que zero.' })
  capacityLiters!: number;

  @ApiProperty({
    example: 8000,
    description: 'Estoque declarado na criacao do tanque. Gera a primeira movimentacao (INITIAL_BALANCE).',
  })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0, { message: 'initialStockLiters nao pode ser negativo.' })
  initialStockLiters!: number;

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
