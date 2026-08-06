import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ParseBooleanQuery } from '../../common/decorators/parse-boolean-query.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum DriverSortField {
  NAME = 'name',
  CREATED_AT = 'createdAt',
  CNH_EXPIRES_AT = 'cnhExpiresAt',
  ADMISSION_DATE = 'admissionDate',
}

export class FindDriversQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Busca livre: compara com nome, CPF, numero da CNH e telefone.',
    example: 'joão',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @ApiPropertyOptional({ description: 'Filtra por status (ativo/inativo).' })
  @IsOptional()
  @ParseBooleanQuery()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: DriverSortField, default: DriverSortField.NAME })
  @IsOptional()
  @IsEnum(DriverSortField)
  sortBy: DriverSortField = DriverSortField.NAME;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
