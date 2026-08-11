import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class EffectiveTollTariffQueryDto {
  @ApiProperty({ example: '9 eixos' })
  @IsString()
  @MinLength(1)
  axleCategory!: string;

  @ApiPropertyOptional({ description: 'Data de referencia -- default: agora.' })
  @IsOptional()
  @IsDateString({}, { message: 'date deve ser uma data valida (ISO 8601).' })
  date?: string;
}
