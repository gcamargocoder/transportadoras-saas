import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

// POST /receivables/from-billing/:billingId -- nao ha nenhuma fonte
// estruturada de prazo de pagamento no projeto hoje (Contract.commercialTerms
// e texto livre, ver docs/receivables.md) -- dueDate e sempre informado
// explicitamente por um humano, nunca inferido/estimado.
export class GenerateReceivableDto {
  @ApiProperty({ example: '2026-09-15', description: 'Data de vencimento do titulo.' })
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional({ description: 'Descricao livre do titulo. Default: referencia a viagem/faturamento.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
