import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TireStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

// locationType/vehicleId/trailerId/position NAO fazem parte deste DTO --
// todo pneu novo nasce em estoque (localizacao so muda via
// POST /tires/:id/movements, nunca aceita diretamente aqui). Mesmo
// principio ja aplicado a totalAmount/driverId/vehicleId em outros modulos:
// nunca confiar no cliente para dados derivados/controlados pelo fluxo.
export class CreateTireDto {
  @ApiProperty({
    example: 'FG-000123',
    description: 'Numero de fogo (identificacao fisica do pneu).',
  })
  @IsString()
  @MinLength(1, { message: 'fireNumber e obrigatorio.' })
  @MaxLength(50)
  fireNumber!: string;

  @ApiProperty({ example: 'Michelin' })
  @IsString()
  @MinLength(1, { message: 'manufacturer e obrigatorio.' })
  @MaxLength(100)
  manufacturer!: string;

  @ApiProperty({ example: 'X Multi Energy Z' })
  @IsString()
  @MinLength(1, { message: 'model e obrigatorio.' })
  @MaxLength(100)
  model!: string;

  @ApiProperty({ example: '295/80R22.5' })
  @IsString()
  @MinLength(1, { message: 'size e obrigatorio.' })
  @MaxLength(30)
  size!: string;

  @ApiPropertyOptional({ example: '1223' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  dot?: string;

  @ApiPropertyOptional({ example: 'SN-987654321' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string;

  @ApiPropertyOptional({ example: '2026-01-15' })
  @IsOptional()
  @IsDateString({}, { message: 'purchaseDate deve ser uma data valida (ISO 8601).' })
  purchaseDate?: string;

  @ApiPropertyOptional({ example: 2450.9 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'purchasePrice nao pode ser negativo.' })
  purchasePrice?: number;

  @ApiPropertyOptional({ example: 120000, description: 'Vida util prevista, em km.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'expectedLifespanKm nao pode ser negativo.' })
  expectedLifespanKm?: number;

  @ApiPropertyOptional({ example: 18, description: 'Sulco inicial, em mm.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'initialTreadDepthMm nao pode ser negativo.' })
  initialTreadDepthMm?: number;

  @ApiPropertyOptional({
    example: 18,
    description: 'Sulco atual, em mm (default: igual ao sulco inicial).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'currentTreadDepthMm nao pode ser negativo.' })
  currentTreadDepthMm?: number;

  @ApiPropertyOptional({ enum: TireStatus, default: TireStatus.STOCK })
  @IsOptional()
  @IsEnum(TireStatus, { message: 'status invalido.' })
  status?: TireStatus;
}
