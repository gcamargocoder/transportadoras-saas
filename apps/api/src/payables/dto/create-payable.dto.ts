import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

// POST /payables -- titulo MANUAL (sem TripExpense de origem), para custos
// administrativos da transportadora sem vinculo com uma viagem (aluguel,
// seguro, fornecedor nao-operacional etc.). Mesma forma de dado de
// GeneratePayableDto + os campos que la vinham da TripExpense (categoria,
// fornecedor, valor, competencia) -- nenhum campo novo alem do que o
// modelo ja suporta.
export class CreatePayableDto {
  @ApiPropertyOptional({ description: 'Nome do fornecedor (texto livre -- o projeto nao possui cadastro estruturado de fornecedores).' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplierName?: string;

  @ApiProperty({ enum: ExpenseCategory })
  @IsEnum(ExpenseCategory, { message: 'category invalida.' })
  category!: ExpenseCategory;

  @ApiProperty({ description: 'Descricao do titulo.' })
  @IsString()
  @MaxLength(500)
  description!: string;

  @ApiProperty({ description: 'Valor total do titulo (ou da 1a parcela em diante, quando parcelado -- ver installments).' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  originalAmount!: number;

  @ApiProperty({ example: '2026-09-01', description: 'Data de competencia (emissao) do titulo.' })
  @IsDateString()
  issueDate!: string;

  @ApiProperty({ example: '2026-09-15', description: 'Vencimento. Quando parcelado, e o vencimento da 1a parcela -- as demais somam 1 mes cada.' })
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional({
    description:
      'Numero de parcelas (default 1). Quando > 1, originalAmount e dividido igualmente entre N titulos ' +
      '(ajuste de arredondamento na ultima parcela), cada um com seu proprio vencimento mensal a partir de dueDate.',
    minimum: 1,
    maximum: 360,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(360)
  installments?: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Documento fiscal (NF-e/CT-e) de origem, quando este titulo foi gerado a partir de um documento importado ' +
      '(autopreenchimento) -- ver GET /fiscal/documents/:id. No maximo 1 titulo por documento fiscal (idempotente). ' +
      'Mutuamente exclusivo com installments > 1 (um documento fiscal gera 1 titulo, nunca parcelas).',
  })
  @IsOptional()
  @IsUUID('4', { message: 'fiscalDocumentId deve ser um UUID valido.' })
  fiscalDocumentId?: string;
}
