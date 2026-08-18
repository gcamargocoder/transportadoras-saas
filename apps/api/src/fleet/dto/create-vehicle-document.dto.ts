import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

// Mesmo padrao de CreateDriverDocumentDto (Fase 6/61) -- apenas o
// registro/metadado do documento (numero, emissao, validade); upload de
// arquivo fica para uma fase futura (ver Attachment no schema).
export class CreateVehicleDocumentDto {
  @ApiProperty({ enum: DocumentType, example: DocumentType.CRLV })
  @IsEnum(DocumentType, { message: 'type invalido.' })
  type!: DocumentType;

  @ApiPropertyOptional({ example: '00123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  number?: string;

  @ApiPropertyOptional({ example: '2023-06-30' })
  @IsOptional()
  @IsDateString({}, { message: 'issuedAt deve ser uma data valida (ISO 8601).' })
  issuedAt?: string;

  @ApiPropertyOptional({ example: '2027-06-30' })
  @IsOptional()
  @IsDateString({}, { message: 'expiresAt deve ser uma data valida (ISO 8601).' })
  expiresAt?: string;
}
