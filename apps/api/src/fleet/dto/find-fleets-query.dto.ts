import { ApiPropertyOptional } from '@nestjs/swagger';
import { FleetType } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ParseBooleanQuery } from '../../common/decorators/parse-boolean-query.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum FleetSortField {
  NAME = 'name',
  CREATED_AT = 'createdAt',
}

export class FindFleetsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca livre por nome.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: FleetType })
  @IsOptional()
  @IsEnum(FleetType)
  type?: FleetType;

  @ApiPropertyOptional({ description: 'Filtra por status (ativo/inativo).' })
  @IsOptional()
  @ParseBooleanQuery()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: FleetSortField, default: FleetSortField.NAME })
  @IsOptional()
  @IsEnum(FleetSortField)
  sortBy: FleetSortField = FleetSortField.NAME;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
