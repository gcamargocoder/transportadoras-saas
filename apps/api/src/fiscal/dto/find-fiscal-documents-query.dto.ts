import { ApiPropertyOptional } from '@nestjs/swagger';
import { FiscalDocumentStatus, FiscalDocumentType } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ParseBooleanQuery } from '../../common/decorators/parse-boolean-query.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum FiscalDocumentSortField {
  ISSUE_DATE = 'issueDate',
  CREATED_AT = 'createdAt',
}

export class FindFiscalDocumentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FiscalDocumentType })
  @IsOptional()
  @IsEnum(FiscalDocumentType, { message: 'documentType invalido.' })
  documentType?: FiscalDocumentType;

  @ApiPropertyOptional({ enum: FiscalDocumentStatus })
  @IsOptional()
  @IsEnum(FiscalDocumentStatus, { message: 'status invalido.' })
  status?: FiscalDocumentStatus;

  @ApiPropertyOptional({ example: '2026-08-01', description: 'Filtra por issueDate (data do evento real, nunca createdAt).' })
  @IsOptional()
  @IsDateString()
  issueDateFrom?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsDateString()
  issueDateTo?: string;

  @ApiPropertyOptional({ maxLength: 60, description: 'Busca exata por documentNumber.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  documentNumber?: string;

  @ApiPropertyOptional({ maxLength: 60, description: 'Busca exata por accessKey.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  accessKey?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  tripId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  driverId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Quando true, lista apenas documentos sem nenhum vinculo operacional (tripId/vehicleId/driverId/customerId todos nulos).',
  })
  @IsOptional()
  @ParseBooleanQuery()
  @IsBoolean()
  unlinkedOnly?: boolean;

  @ApiPropertyOptional({ enum: FiscalDocumentSortField, default: FiscalDocumentSortField.CREATED_AT })
  @IsOptional()
  @IsIn(Object.values(FiscalDocumentSortField))
  sortBy: FiscalDocumentSortField = FiscalDocumentSortField.CREATED_AT;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
