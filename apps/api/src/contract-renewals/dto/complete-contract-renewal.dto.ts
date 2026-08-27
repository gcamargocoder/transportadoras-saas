import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// Fase 98 -- conclui a renovacao: cria o NOVO Contract (mesmo
// ContractsService.create ja existente -- regra 2). code/startDate sao
// obrigatorios (mesma exigencia de CreateContractDto); description/
// commercialTerms/notes, quando omitidos, sao herdados do contrato
// anterior (mesmo espirito de ReviseFreightRuleDto -- "campos omitidos
// herdam a versao anterior" -- nunca uma alteracao SILENCIOSA: o usuario
// decidiu explicitamente concluir a renovacao com esses valores, herdados
// ou nao).
export class CompleteContractRenewalDto {
  @ApiProperty({ example: 'CTR-2027-001' })
  @IsString()
  @MinLength(1, { message: 'code e obrigatorio.' })
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: '2027-01-01T00:00:00.000Z', description: 'Inicio da nova vigencia.' })
  @IsDateString({}, { message: 'startDate deve ser uma data valida (ISO 8601).' })
  startDate!: string;

  @ApiPropertyOptional({ example: '2027-12-31T00:00:00.000Z', description: 'Nulo = sem termino definido.' })
  @IsOptional()
  @IsDateString({}, { message: 'endDate deve ser uma data valida (ISO 8601).' })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Omitido: herdado do contrato anterior.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Omitido: herdado do contrato anterior.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  commercialTerms?: string;

  @ApiPropertyOptional({ description: 'Omitido: herdado do contrato anterior.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
