import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

// Fase 96 -- customerId e sempre obrigatorio; quotationId/proposalId sao
// opcionais ("quando aplicavel"), sem exigir nenhum status especifico
// (diferente de Proposal, que so aceita Quotation APPROVED) -- uma
// oportunidade pode existir desde o primeiro contato. stageId opcional:
// omitido, cai no primeiro estagio (menor `order`) do tenant. estimatedValue
// opcional: quando omitido e ha quotationId/proposalId, herda
// Proposal.totalAmount ou Quotation.amount (nunca um novo calculo -- regra
// 3); sem nenhum vinculo, fica null (nunca um valor inventado).
export class CreatePipelineOpportunityDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'customerId deve ser um UUID valido.' })
  customerId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'quotationId deve ser um UUID valido.' })
  quotationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'proposalId deve ser um UUID valido.' })
  proposalId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Omitido: primeiro estagio (menor order) do tenant.' })
  @IsOptional()
  @IsUUID('4', { message: 'stageId deve ser um UUID valido.' })
  stageId?: string;

  @ApiPropertyOptional({ example: 'Expansão frota SP' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Herdado de Proposal/Quotation quando omitido e houver vinculo.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
