import { ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleType } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ParseBooleanQuery } from '../../common/decorators/parse-boolean-query.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum VehicleSortField {
  PLATE = 'plate',
  BRAND = 'brand',
  MODEL = 'model',
  CREATED_AT = 'createdAt',
}

export class FindVehiclesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca livre: compara com placa, marca, modelo e chassi.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'fleetId deve ser um UUID valido.' })
  fleetId?: string;

  @ApiPropertyOptional({ enum: VehicleType })
  @IsOptional()
  @IsEnum(VehicleType)
  type?: VehicleType;

  @ApiPropertyOptional({ description: 'Filtra por status (ativo/inativo).' })
  @IsOptional()
  @ParseBooleanQuery()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: VehicleSortField, default: VehicleSortField.PLATE })
  @IsOptional()
  @IsEnum(VehicleSortField)
  sortBy: VehicleSortField = VehicleSortField.PLATE;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
