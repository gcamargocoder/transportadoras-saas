import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';

// Fase 83, secao 4 -- entrada manual (compra/devolucao/recebimento/ajuste
// positivo). Sem CRM/fornecedor: `reference` e texto livre (ex: numero da
// nota fiscal, nome do fornecedor) -- compativel com o modelo existente,
// nenhuma entidade nova de fornecedor criada.
export class RegisterStockInDto {
  @ApiProperty({ example: 10 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'quantity deve ser maior que zero.' })
  quantity!: number;

  @ApiPropertyOptional({ example: 45.9, description: 'Custo unitario de referencia (ex: preco de compra).' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'unitCost nao pode ser negativo.' })
  unitCost?: number;

  @ApiPropertyOptional({ example: '2026-08-20', description: 'Data do movimento (default: agora).' })
  @IsOptional()
  @IsDateString({}, { message: 'movementDate deve ser uma data valida (ISO 8601).' })
  movementDate?: string;

  @ApiPropertyOptional({ example: 'Compra' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  reason?: string;

  @ApiPropertyOptional({ example: 'NF-000123', description: 'Referencia/origem (nota fiscal, fornecedor, pedido).' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  reference?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
