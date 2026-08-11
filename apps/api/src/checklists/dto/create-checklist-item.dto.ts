import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChecklistItemType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, Min, MaxLength } from 'class-validator';

// Pergunta/campo dentro de uma ChecklistSection. Aninhado no payload de
// CreateChecklistTemplateDto/UpdateChecklistTemplateDto -- nao existe
// endpoint proprio de criacao de item (ver justificativa no plano da Fase
// 38: nao construir uma interface administrativa gigantesca).
export class CreateChecklistItemDto {
  @ApiProperty({ example: 'cinto_seguranca', description: 'Chave estavel dentro da section.' })
  @IsString()
  @MaxLength(100)
  code!: string;

  @ApiProperty({ example: 'Cinto de seguranca perfeito e funcionando?' })
  @IsString()
  @MaxLength(500)
  label!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ enum: ChecklistItemType })
  @IsEnum(ChecklistItemType, { message: 'type invalido.' })
  type!: ChecklistItemType;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiProperty({ description: 'Ordem explicita de exibicao dentro da section.' })
  @IsInt()
  @Min(0)
  order!: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresObservation?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresPhoto?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Resposta negativa representa uma nao-conformidade relevante (ver secao 16 da Fase 38).',
  })
  @IsOptional()
  @IsBoolean()
  critical?: boolean;

  @ApiPropertyOptional({ description: 'Configuracao extra especifica do tipo (ex: opcoes de um SELECT).' })
  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;
}
