import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTireRetreadDto {
  @ApiProperty({ example: 'Recapadora Central' })
  @IsString()
  @MinLength(1, { message: 'company e obrigatoria.' })
  @MaxLength(150)
  company!: string;

  @ApiProperty({ example: 650 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'cost deve ser maior que zero.' })
  cost!: number;

  @ApiProperty({ example: '2026-09-02' })
  @IsDateString({}, { message: 'retreadDate deve ser uma data valida (ISO 8601).' })
  retreadDate!: string;

  @ApiPropertyOptional({ example: 'Garantia de 40.000 km ou 12 meses.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  warranty?: string;

  @ApiPropertyOptional({
    example: 98000,
    description: 'Quilometragem do pneu no momento da recapagem.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'mileageKm nao pode ser negativo.' })
  mileageKm?: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
