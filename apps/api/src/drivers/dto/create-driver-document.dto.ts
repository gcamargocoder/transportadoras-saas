import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

// Apenas o registro/metadado do documento (numero, emissao, validade) --
// upload de arquivo fica para uma fase futura (ver Attachment no schema).
export class CreateDriverDocumentDto {
  @ApiProperty({ enum: DocumentType, example: DocumentType.CNH })
  @IsEnum(DocumentType, { message: 'type invalido.' })
  type!: DocumentType;

  @ApiPropertyOptional({ example: '12345678900' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  number?: string;

  @ApiPropertyOptional({ example: '2022-06-30' })
  @IsOptional()
  @IsDateString({}, { message: 'issuedAt deve ser uma data valida (ISO 8601).' })
  issuedAt?: string;

  @ApiPropertyOptional({ example: '2027-06-30' })
  @IsOptional()
  @IsDateString({}, { message: 'expiresAt deve ser uma data valida (ISO 8601).' })
  expiresAt?: string;
}
