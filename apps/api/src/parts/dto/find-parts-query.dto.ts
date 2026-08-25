import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ParseBooleanQuery } from '../../common/decorators/parse-boolean-query.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum PartSortField {
  NAME = 'name',
  SKU = 'sku',
  CURRENT_STOCK = 'currentStock',
  CREATED_AT = 'createdAt',
}

export class FindPartsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca livre: nome, SKU ou codigo OEM.' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @ApiPropertyOptional({ description: 'Filtra por categoria (parcial).' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ description: 'Filtra por ativo/inativo.' })
  @IsOptional()
  @ParseBooleanQuery()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Filtra pecas com currentStock <= minStock (cache persistido, ver Part.isLowStock).',
  })
  @IsOptional()
  @ParseBooleanQuery()
  @IsBoolean()
  lowStock?: boolean;

  @ApiPropertyOptional({ description: 'Filtra pecas com currentStock <= 0.' })
  @IsOptional()
  @ParseBooleanQuery()
  @IsBoolean()
  zeroStock?: boolean;

  @ApiPropertyOptional({ enum: PartSortField, default: PartSortField.NAME })
  @IsOptional()
  @IsIn(Object.values(PartSortField))
  sortBy: PartSortField = PartSortField.NAME;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
