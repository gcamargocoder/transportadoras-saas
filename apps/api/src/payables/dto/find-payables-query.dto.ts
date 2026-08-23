import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { EFFECTIVE_PAYABLE_STATUS_VALUES, EffectivePayableStatus } from '../utils/payable-status.util';

// GET /payables -- mesmo espirito de FindReceivablesQueryDto (Fase 72).
// category reaproveita ExpenseCategory (nenhum enum paralelo).
export class FindPayablesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca por descricao/fornecedor.' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  tripId?: string;

  @ApiPropertyOptional({ enum: ExpenseCategory })
  @IsOptional()
  @IsEnum(ExpenseCategory, { message: 'category invalida.' })
  category?: ExpenseCategory;

  @ApiPropertyOptional({ enum: EFFECTIVE_PAYABLE_STATUS_VALUES })
  @IsOptional()
  @IsIn(EFFECTIVE_PAYABLE_STATUS_VALUES)
  status?: EffectivePayableStatus;

  @ApiPropertyOptional({ example: '2026-08-01', description: 'Filtra por issueDate >= from.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31', description: 'Filtra por issueDate <= to.' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Filtra por dueDate >= dueFrom.' })
  @IsOptional()
  @IsDateString()
  dueFrom?: string;

  @ApiPropertyOptional({ description: 'Filtra por dueDate <= dueTo.' })
  @IsOptional()
  @IsDateString()
  dueTo?: string;
}
