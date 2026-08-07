import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';

// Registrar uma inspecao atualiza Tire.currentTreadDepthMm automaticamente
// (ver TiresService.createInspection) -- treadDepthMm e obrigatorio de
// proposito, ja que essa e a leitura que passa a ser "o sulco atual" do pneu.
export class CreateTireInspectionDto {
  @ApiProperty({ example: 12.5, description: 'Sulco medido, em mm.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'treadDepthMm nao pode ser negativo.' })
  treadDepthMm!: number;

  @ApiPropertyOptional({ example: 110, description: 'Pressao medida, em PSI.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'pressurePsi nao pode ser negativo.' })
  pressurePsi?: number;

  @ApiPropertyOptional({ example: '2026-09-02T08:00:00.000Z', description: 'Default: agora.' })
  @IsOptional()
  @IsDateString({}, { message: 'inspectionDate deve ser uma data valida (ISO 8601).' })
  inspectionDate?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
