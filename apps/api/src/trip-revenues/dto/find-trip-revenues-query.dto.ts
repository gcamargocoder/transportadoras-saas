import { ApiPropertyOptional } from '@nestjs/swagger';
import { RevenueCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum TripRevenueSortField {
  RECEIVED_AT = 'receivedAt',
  CREATED_AT = 'createdAt',
  AMOUNT = 'amount',
}

export class FindTripRevenuesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por viagem.' })
  @IsOptional()
  @IsUUID('4')
  tripId?: string;

  @ApiPropertyOptional({ enum: RevenueCategory })
  @IsOptional()
  @IsEnum(RevenueCategory, { message: 'category invalida.' })
  category?: RevenueCategory;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  receivedFrom?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  receivedTo?: string;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @ApiPropertyOptional({ example: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @ApiPropertyOptional({ enum: TripRevenueSortField, default: TripRevenueSortField.RECEIVED_AT })
  @IsOptional()
  @IsIn(Object.values(TripRevenueSortField))
  sortBy: TripRevenueSortField = TripRevenueSortField.RECEIVED_AT;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
