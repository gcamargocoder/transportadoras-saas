import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory, ExpenseStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum TripExpenseSortField {
  EXPENSE_DATE = 'expenseDate',
  CREATED_AT = 'createdAt',
  AMOUNT = 'amount',
}

export class FindTripExpensesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por viagem.' })
  @IsOptional()
  @IsUUID('4')
  tripId?: string;

  @ApiPropertyOptional({ enum: ExpenseCategory })
  @IsOptional()
  @IsEnum(ExpenseCategory, { message: 'category invalida.' })
  category?: ExpenseCategory;

  @ApiPropertyOptional({ enum: ExpenseStatus })
  @IsOptional()
  @IsEnum(ExpenseStatus, { message: 'status invalido.' })
  status?: ExpenseStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  driverId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @ApiPropertyOptional({ description: 'Busca parcial (case-insensitive) por fornecedor.' })
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  expenseDateFrom?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  expenseDateTo?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @ApiPropertyOptional({ enum: TripExpenseSortField, default: TripExpenseSortField.EXPENSE_DATE })
  @IsOptional()
  @IsIn(Object.values(TripExpenseSortField))
  sortBy: TripExpenseSortField = TripExpenseSortField.EXPENSE_DATE;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
