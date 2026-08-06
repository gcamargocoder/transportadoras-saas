import { ApiPropertyOptional } from '@nestjs/swagger';
import { TrailerType } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ParseBooleanQuery } from '../../common/decorators/parse-boolean-query.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum TrailerSortField {
  PLATE = 'plate',
  CREATED_AT = 'createdAt',
}

export class FindTrailersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca livre por placa.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: TrailerType })
  @IsOptional()
  @IsEnum(TrailerType)
  type?: TrailerType;

  @ApiPropertyOptional({ description: 'Filtra por status (ativo/inativo).' })
  @IsOptional()
  @ParseBooleanQuery()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: TrailerSortField, default: TrailerSortField.PLATE })
  @IsOptional()
  @IsEnum(TrailerSortField)
  sortBy: TrailerSortField = TrailerSortField.PLATE;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
