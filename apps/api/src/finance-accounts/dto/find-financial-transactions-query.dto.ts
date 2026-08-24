import { ApiPropertyOptional } from '@nestjs/swagger';
import { FinancialTransactionType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// GET /finance/accounts/:id/transactions -- secao 8 do pedido: from/to/type,
// sempre ordenado por transactionDate DESC, createdAt DESC.
export class FindFinancialTransactionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: FinancialTransactionType })
  @IsOptional()
  @IsEnum(FinancialTransactionType, { message: 'type invalido.' })
  type?: FinancialTransactionType;
}
