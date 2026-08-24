import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

// POST /finance/transfers -- secao 4/9 do pedido: origem != destino
// (validado no service, nao aqui -- depende dos dois valores juntos),
// ambas as contas do mesmo tenant e ativas, operacao atomica (uma unica
// transacao Prisma cria as duas FinancialTransaction ou nenhuma).
export class CreateFinancialTransferDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  sourceAccountId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  destinationAccountId!: string;

  @ApiProperty({ description: 'Sempre positivo.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiProperty({ example: '2026-08-24' })
  @IsDateString()
  transactionDate!: string;

  @ApiPropertyOptional({ example: 'Transferencia para cobrir despesas da filial' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  description?: string;
}
