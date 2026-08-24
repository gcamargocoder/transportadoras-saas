import { ApiPropertyOptional } from '@nestjs/swagger';
import { FinancialBankTransactionStatus, FinancialTransactionType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

// GET /finance/bank-transactions/dashboard -- secao 11: agregado, sem
// paginacao. Mesmos filtros da listagem.
export class FindBankReconciliationDashboardQueryDto {
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
