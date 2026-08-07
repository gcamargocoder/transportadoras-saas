import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExpensePaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum TripAdvanceSortField {
  PAID_AT = 'paidAt',
  CREATED_AT = 'createdAt',
  AMOUNT = 'amount',
}

export class FindTripAdvancesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por viagem.' })
  @IsOptional()
  @IsUUID('4')
  tripId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  driverId?: string;

  @ApiPropertyOptional({ enum: ExpensePaymentMethod })
  @IsOptional()
  @IsEnum(ExpensePaymentMethod, { message: 'paymentMethod invalido.' })
  paymentMethod?: ExpensePaymentMethod;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  paidFrom?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  paidTo?: string;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @ApiPropertyOptional({ enum: TripAdvanceSortField, default: TripAdvanceSortField.PAID_AT })
  @IsOptional()
  @IsIn(Object.values(TripAdvanceSortField))
  sortBy: TripAdvanceSortField = TripAdvanceSortField.PAID_AT;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
