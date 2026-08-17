import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateContractDto {
  @ApiProperty({ format: 'uuid', description: 'Cliente ao qual o contrato pertence.' })
  @IsUUID('4', { message: 'customerId deve ser um UUID valido.' })
  customerId!: string;

  @ApiProperty({ example: 'CTR-2026-001' })
  @IsString()
  @MinLength(1, { message: 'code e obrigatorio.' })
  @MaxLength(50)
  code!: string;

  @ApiPropertyOptional({ example: 'Contrato anual de transporte -- linha SP/RJ' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  @IsDateString({}, { message: 'startDate deve ser uma data valida (ISO 8601).' })
  startDate!: string;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z', description: 'Nulo = sem termino definido.' })
  @IsOptional()
  @IsDateString({}, { message: 'endDate deve ser uma data valida (ISO 8601).' })
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Condicoes comerciais em texto livre (prazo, reajuste, SLA etc.).' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  commercialTerms?: string;
}
