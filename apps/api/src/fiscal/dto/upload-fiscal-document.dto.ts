import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FiscalDocumentType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// O arquivo em si chega via multipart (@UploadedFile(), fora deste DTO) --
// aqui so os campos de formulario que acompanham o upload (mesmo padrao de
// UploadChecklistEvidenceDto/UploadTollImportDto). Nao ha parser nesta rota
// -- os campos abaixo sao sempre informados manualmente pelo usuario (nunca
// extraidos do arquivo); para extracao automatica ver POST
// /fiscal/documents/import (so XML).
export class UploadFiscalDocumentDto {
  @ApiProperty({ enum: FiscalDocumentType })
  @IsEnum(FiscalDocumentType, { message: 'documentType invalido.' })
  documentType!: FiscalDocumentType;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  documentNumber?: string;

  @ApiPropertyOptional({ maxLength: 60, description: 'Chave de acesso (44 digitos para NF-e/CT-e/MDF-e), quando conhecida.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  accessKey?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  series?: string;

  @ApiPropertyOptional({ example: '2026-08-16' })
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  senderName?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  senderDocument?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientName?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  recipientDocument?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Vinculo com a viagem, quando aplicavel.' })
  @IsOptional()
  @IsUUID('4', { message: 'tripId deve ser um UUID valido.' })
  tripId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'vehicleId deve ser um UUID valido.' })
  vehicleId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'driverId deve ser um UUID valido.' })
  driverId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'customerId deve ser um UUID valido.' })
  customerId?: string;
}
