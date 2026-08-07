import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTireDisposalDto {
  @ApiProperty({ example: 'Desgaste irreparavel abaixo do limite legal.' })
  @IsString()
  @MinLength(1, { message: 'reason e obrigatorio.' })
  @MaxLength(500)
  reason!: string;

  @ApiProperty({ example: '2026-09-02' })
  @IsDateString({}, { message: 'disposalDate deve ser uma data valida (ISO 8601).' })
  disposalDate!: string;

  @ApiPropertyOptional({ example: 145000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'odometerKm nao pode ser negativo.' })
  odometerKm?: number;

  @ApiPropertyOptional({
    example: 35,
    description: 'Valor residual (ex: venda como sucata/borracharia).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'residualValue nao pode ser negativo.' })
  residualValue?: number;
}
