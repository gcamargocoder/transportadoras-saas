import { ApiPropertyOptional } from '@nestjs/swagger';
import { ImportJobStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum ImportJobSortField {
  CREATED_AT = 'createdAt',
  FINISHED_AT = 'finishedAt',
}

export class FindImportJobsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por operadora.' })
  @IsOptional()
  @IsUUID('4')
  providerId?: string;

  @ApiPropertyOptional({ enum: ImportJobStatus })
  @IsOptional()
  @IsEnum(ImportJobStatus, { message: 'status invalido.' })
  status?: ImportJobStatus;

  @ApiPropertyOptional({ enum: ImportJobSortField, default: ImportJobSortField.CREATED_AT })
  @IsOptional()
  @IsIn(Object.values(ImportJobSortField))
  sortBy: ImportJobSortField = ImportJobSortField.CREATED_AT;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
