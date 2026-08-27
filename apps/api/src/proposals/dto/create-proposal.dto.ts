import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

// Fase 95 -- criacao direta OU a partir de uma Quotation (regra "quando
// aplicavel"). customerId e SEMPRE obrigatorio, mesmo quando quotationId e
// informado (nunca derivado implicitamente -- o service valida que ambos
// concordam). totalAmount/commercialConditions sao opcionais aqui porque,
// quando ha quotationId, sao herdados do snapshot ja calculado da Quotation
// (nunca um novo motor de precificacao, regra 3); sem quotationId, o
// service exige totalAmount explicitamente.
export class CreateProposalDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'customerId deve ser um UUID valido.' })
  customerId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Cotacao de origem (precisa estar APPROVED). Quando informada, valor/condicoes sao herdados dela se nao sobrescritos.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'quotationId deve ser um UUID valido.' })
  quotationId?: string;

  @ApiPropertyOptional({ description: 'Obrigatorio quando quotationId nao e informado.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalAmount?: number;

  @ApiPropertyOptional({ description: 'Condicoes comerciais (prazo, forma de pagamento...). Herdado da Quotation quando omitido.' })
  @IsOptional()
  @IsString()
  commercialConditions?: string;

  @ApiPropertyOptional({ description: 'Observacoes comerciais.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ example: '2026-10-15T00:00:00.000Z', description: 'Validade da proposta.' })
  @IsDateString({}, { message: 'validUntil deve ser uma data valida (ISO 8601).' })
  validUntil!: string;
}
