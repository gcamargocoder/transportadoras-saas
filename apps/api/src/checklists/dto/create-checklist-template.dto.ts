import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChecklistType, TrailerType, VehicleType } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CreateChecklistSectionDto } from './create-checklist-section.dto';

// Cria o template inteiro (sections + items aninhados) em uma unica
// chamada, dentro de uma $transaction (ver ChecklistTemplatesService.create)
// -- nao existem endpoints separados para section/item (Fase 38, ver
// justificativa no plano: nao construir uma interface administrativa
// gigantesca para 3 niveis de hierarquia). Nasce sempre em DRAFT.
export class CreateChecklistTemplateDto {
  @ApiProperty({ example: 'Sider Pre-Viagem' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ enum: ChecklistType })
  @IsEnum(ChecklistType, { message: 'type invalido.' })
  type!: ChecklistType;

  @ApiPropertyOptional({ enum: VehicleType })
  @IsOptional()
  @IsEnum(VehicleType, { message: 'vehicleType invalido.' })
  vehicleType?: VehicleType;

  @ApiPropertyOptional({ enum: TrailerType })
  @IsOptional()
  @IsEnum(TrailerType, { message: 'trailerType invalido.' })
  trailerType?: TrailerType;

  @ApiProperty({ type: [CreateChecklistSectionDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'o template precisa de pelo menos 1 section.' })
  @ArrayMaxSize(50, { message: 'no maximo 50 sections por template.' })
  @ValidateNested({ each: true })
  @Type(() => CreateChecklistSectionDto)
  sections!: CreateChecklistSectionDto[];
}
