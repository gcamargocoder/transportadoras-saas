import { ApiPropertyOptional } from '@nestjs/swagger';
import { FinancialPeriodStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// GET /finance/periods -- secao 5 do pedido: filtros por year/status,
// ordenado sempre por year DESC, month DESC.
export class FindFinancialPeriodsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 2000, maximum: 2100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ enum: FinancialPeriodStatus })
  @IsOptional()
  @IsEnum(FinancialPeriodStatus, { message: 'status invalido.' })
  status?: FinancialPeriodStatus;
}
