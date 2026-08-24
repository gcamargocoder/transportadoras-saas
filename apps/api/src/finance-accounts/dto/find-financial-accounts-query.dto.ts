import { ApiPropertyOptional } from '@nestjs/swagger';
import { FinancialAccountType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// GET /finance/accounts -- secao 7 do pedido: filtros por type/isActive.
export class FindFinancialAccountsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FinancialAccountType })
  @IsOptional()
  @IsEnum(FinancialAccountType, { message: 'type invalido.' })
  type?: FinancialAccountType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
