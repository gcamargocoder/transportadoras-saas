import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { ParseBooleanQuery } from '../../common/decorators/parse-boolean-query.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum FuelStationSortField {
  NAME = 'name',
  CREATED_AT = 'createdAt',
}

export class FindFuelStationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca livre: nome ou cidade.' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @ApiPropertyOptional({ example: 'PR' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @ParseBooleanQuery()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: FuelStationSortField, default: FuelStationSortField.NAME })
  @IsOptional()
  @IsIn(Object.values(FuelStationSortField))
  sortBy: FuelStationSortField = FuelStationSortField.NAME;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
