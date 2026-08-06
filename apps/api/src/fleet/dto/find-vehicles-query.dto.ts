import { ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleStatus, VehicleType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const MIN_VEHICLE_YEAR = 1950;
const currentYear = new Date().getFullYear();

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

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por frota.' })
  @IsOptional()
  @IsUUID('4', { message: 'fleetId deve ser um UUID valido.' })
  fleetId?: string;

  @ApiPropertyOptional({ enum: VehicleType })
  @IsOptional()
  @IsEnum(VehicleType)
  type?: VehicleType;

  @ApiPropertyOptional({ description: 'Filtra por categoria (parcial).' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @ApiPropertyOptional({ enum: VehicleStatus, description: 'Filtra por situacao do veiculo.' })
  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @ApiPropertyOptional({ description: 'Filtra por placa (parcial, com ou sem formatacao).' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  plate?: string;

  @ApiPropertyOptional({ description: 'Filtra por marca (parcial).' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  brand?: string;

  @ApiPropertyOptional({ description: 'Filtra por modelo (parcial).' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  model?: string;

  @ApiPropertyOptional({ description: 'Filtra por ano de fabricacao exato.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_VEHICLE_YEAR)
  @Max(currentYear + 1)
  manufactureYear?: number;

  @ApiPropertyOptional({ description: 'Filtra por ano do modelo exato.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_VEHICLE_YEAR)
  @Max(currentYear + 1)
  modelYear?: number;

  @ApiPropertyOptional({ enum: VehicleSortField, default: VehicleSortField.PLATE })
  @IsOptional()
  @IsEnum(VehicleSortField)
  sortBy: VehicleSortField = VehicleSortField.PLATE;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
