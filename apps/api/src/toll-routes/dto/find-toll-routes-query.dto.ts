import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum TollRouteSortField {
  NAME = 'name',
  CREATED_AT = 'createdAt',
}

export class FindTollRoutesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca livre: nome, origem ou destino.' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: TollRouteSortField, default: TollRouteSortField.NAME })
  @IsOptional()
  @IsIn(Object.values(TollRouteSortField))
  sortBy: TollRouteSortField = TollRouteSortField.NAME;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
