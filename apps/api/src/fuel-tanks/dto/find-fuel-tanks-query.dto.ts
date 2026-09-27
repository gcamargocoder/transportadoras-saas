import { ApiPropertyOptional } from '@nestjs/swagger';
import { FuelType } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ParseBooleanQuery } from '../../common/decorators/parse-boolean-query.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum FuelTankSortField {
  NAME = 'name',
  CURRENT_STOCK = 'currentStockLiters',
  CREATED_AT = 'createdAt',
}

export class FindFuelTanksQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca livre: nome ou localizacao.' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @ApiPropertyOptional({ description: 'Filtra por ativo/inativo.' })
  @IsOptional()
  @ParseBooleanQuery()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Filtra tanques com currentStockLiters <= minStockLiters (cache persistido, ver FuelTank.isLowStock).',
  })
  @IsOptional()
  @ParseBooleanQuery()
  @IsBoolean()
  lowStock?: boolean;

  @ApiPropertyOptional({ enum: FuelType })
  @IsOptional()
  @IsEnum(FuelType)
  fuelType?: FuelType;

  @ApiPropertyOptional({ enum: FuelTankSortField, default: FuelTankSortField.NAME })
  @IsOptional()
  @IsIn(Object.values(FuelTankSortField))
  sortBy: FuelTankSortField = FuelTankSortField.NAME;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
