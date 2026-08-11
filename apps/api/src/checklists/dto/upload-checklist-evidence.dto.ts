import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChecklistEvidenceType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// O arquivo em si chega via multipart (@UploadedFile(), fora deste DTO) --
// aqui so os campos de formulario que acompanham o upload (mesmo padrao de
// UploadTollImportDto, Fase 33).
export class UploadChecklistEvidenceDto {
  @ApiProperty({ description: 'Id gerado pelo dispositivo -- garante idempotencia.' })
  @IsString()
  deviceEventId!: string;

  @ApiProperty({ enum: ChecklistEvidenceType })
  @IsEnum(ChecklistEvidenceType, { message: 'type invalido.' })
  type!: ChecklistEvidenceType;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Item do template ao qual esta evidencia se associa -- associacao primaria, independente de a resposta ja ter sido enviada.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'itemId deve ser um UUID valido.' })
  itemId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Resposta a qual esta evidencia se associa, quando ja existir.' })
  @IsOptional()
  @IsUUID('4', { message: 'answerId deve ser um UUID valido.' })
  answerId?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;
}
