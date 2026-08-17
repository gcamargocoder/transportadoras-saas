import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateFreightTableDto {
  @ApiProperty({ format: 'uuid', description: 'Cliente ao qual a tabela pertence.' })
  @IsUUID('4', { message: 'customerId deve ser um UUID valido.' })
  customerId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Contrato opcional ao qual a tabela esta associada.' })
  @IsOptional()
  @IsUUID('4', { message: 'contractId deve ser um UUID valido.' })
  contractId?: string;

  @ApiProperty({ example: 'Tabela SP-RJ 2026' })
  @IsString()
  @MinLength(1, { message: 'name e obrigatorio.' })
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'TAB-2026-001' })
  @IsString()
  @MinLength(1, { message: 'code e obrigatorio.' })
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  @IsDateString({}, { message: 'effectiveFrom deve ser uma data valida (ISO 8601).' })
  effectiveFrom!: string;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z', description: 'Nulo = sem termino definido.' })
  @IsOptional()
  @IsDateString({}, { message: 'effectiveUntil deve ser uma data valida (ISO 8601).' })
  effectiveUntil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
