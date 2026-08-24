import { ApiPropertyOptional } from '@nestjs/swagger';
import { FinancialBankTransactionStatus, FinancialTransactionType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// GET /finance/bank-transactions -- secao 4/11 do pedido: filtros por
// conta/periodo/status/tipo, sempre paginado.
export class FindBankTransactionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  financialAccountId?: string;

  @ApiPropertyOptional({ enum: FinancialBankTransactionStatus })
  @IsOptional()
  @IsEnum(FinancialBankTransactionStatus, { message: 'status invalido.' })
  status?: FinancialBankTransactionStatus;

  @ApiPropertyOptional({ enum: FinancialTransactionType })
  @IsOptional()
  @IsEnum(FinancialTransactionType, { message: 'type invalido.' })
  type?: FinancialTransactionType;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
