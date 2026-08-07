import { ApiPropertyOptional } from '@nestjs/swagger';
import { FuelType } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum FuelSupplySortField {
  SUPPLY_DATE = 'supplyDate',
  CREATED_AT = 'createdAt',
  TOTAL_AMOUNT = 'totalAmount',
}

export class FindFuelSuppliesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  driverId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  tripId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  fuelStationId?: string;

  @ApiPropertyOptional({ enum: FuelType })
  @IsOptional()
  @IsEnum(FuelType, { message: 'fuelType invalido.' })
  fuelType?: FuelType;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  supplyDateFrom?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  supplyDateTo?: string;

  @ApiPropertyOptional({ enum: FuelSupplySortField, default: FuelSupplySortField.SUPPLY_DATE })
  @IsOptional()
  @IsIn(Object.values(FuelSupplySortField))
  sortBy: FuelSupplySortField = FuelSupplySortField.SUPPLY_DATE;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
