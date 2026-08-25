import { ApiPropertyOptional } from '@nestjs/swagger';
import { MaintenanceProviderType } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ParseBooleanQuery } from '../../common/decorators/parse-boolean-query.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum MaintenanceProviderSortField {
  NAME = 'name',
  CREATED_AT = 'createdAt',
}

export class FindMaintenanceProvidersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MaintenanceProviderType, description: 'WORKSHOP (oficina) ou SUPPLIER (fornecedor).' })
  @IsOptional()
  @IsEnum(MaintenanceProviderType, { message: 'type invalido.' })
  type?: MaintenanceProviderType;

  @ApiPropertyOptional({ description: 'Busca livre: nome, nome fantasia ou documento.' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @ApiPropertyOptional({ description: 'Filtra por ativo/inativo.' })
  @IsOptional()
  @ParseBooleanQuery()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: MaintenanceProviderSortField, default: MaintenanceProviderSortField.NAME })
  @IsOptional()
  @IsIn(Object.values(MaintenanceProviderSortField))
  sortBy: MaintenanceProviderSortField = MaintenanceProviderSortField.NAME;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
