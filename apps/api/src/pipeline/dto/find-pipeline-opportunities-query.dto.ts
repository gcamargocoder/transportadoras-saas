import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum PipelineOpportunitySortField {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  ESTIMATED_VALUE = 'estimatedValue',
  STAGE = 'stage',
}

export class FindPipelineOpportunitiesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  stageId?: string;

  @ApiPropertyOptional({ description: 'Busca livre por titulo, observacoes ou nome do cliente.' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @ApiPropertyOptional({ description: 'Periodo -- inicio (createdAt >=).' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Periodo -- fim (createdAt <=).' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: PipelineOpportunitySortField, default: PipelineOpportunitySortField.CREATED_AT })
  @IsOptional()
  @IsEnum(PipelineOpportunitySortField)
  sortBy: PipelineOpportunitySortField = PipelineOpportunitySortField.CREATED_AT;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
