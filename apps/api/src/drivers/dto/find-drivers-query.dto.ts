import { ApiPropertyOptional } from '@nestjs/swagger';
import { DriverStatus, DriverType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ParseBooleanQuery } from '../../common/decorators/parse-boolean-query.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { IsCnhCategory } from '../validators/is-cnh-category.validator';

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

  @ApiPropertyOptional({ description: 'Filtra por status legado (ativo/inativo) -- prefira "status".' })
  @IsOptional()
  @ParseBooleanQuery()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: DriverType, description: 'Filtra por classificacao operacional.' })
  @IsOptional()
  @IsEnum(DriverType, { message: 'type invalido.' })
  type?: DriverType;

  @ApiPropertyOptional({ enum: DriverStatus, description: 'Filtra por status operacional.' })
  @IsOptional()
  @IsEnum(DriverStatus, { message: 'status invalido.' })
  status?: DriverStatus;

  @ApiPropertyOptional({ description: 'Filtra por CPF exato (com ou sem formatacao).' })
  @IsOptional()
  @IsString()
  @MaxLength(14)
  cpf?: string;

  @ApiPropertyOptional({
    description: 'Filtra por categoria de CNH (A, B, C, D, E, AB, AC, AD, AE).',
  })
  @IsOptional()
  @IsCnhCategory()
  cnhCategory?: string;

  @ApiPropertyOptional({
    description: 'Filtra motoristas cuja CNH vence em ate N dias (inclui as ja vencidas).',
    example: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  cnhExpiringInDays?: number;

  @ApiPropertyOptional({ enum: DriverSortField, default: DriverSortField.NAME })
  @IsOptional()
  @IsEnum(DriverSortField)
  sortBy: DriverSortField = DriverSortField.NAME;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
