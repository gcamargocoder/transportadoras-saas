import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

// POST /payables/from-expense/:expenseId -- assim como em Receivable (Fase
// 72), nao ha nenhuma fonte estruturada de prazo de pagamento no projeto
// hoje -- dueDate e sempre informado explicitamente, nunca inferido.
export class GeneratePayableDto {
  @ApiProperty({ example: '2026-09-15', description: 'Data de vencimento do titulo.' })
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional({ description: 'Descricao livre do titulo. Default: descricao da despesa original.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
