import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseCategory, ExpensePaymentMethod } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

// driverId e vehicleId NAO fazem parte deste DTO de proposito -- sao
// SEMPRE derivados da Trip (motorista/veiculo da composicao) no momento do
// registro, nunca aceitos do cliente (mesmo principio ja aplicado em
// CreateTollTransactionDto, Fase 14). status/approvedBy/approvedAt/
// createdBy/updatedBy tambem sao sempre controlados pelo servidor.
export class CreateTripExpenseDto {
  @ApiProperty({ format: 'uuid', description: 'Viagem a qual a despesa pertence.' })
  @IsUUID('4', { message: 'tripId deve ser um UUID valido.' })
  tripId!: string;

  @ApiProperty({ enum: ExpenseCategory, example: ExpenseCategory.FUEL })
  @IsEnum(ExpenseCategory, { message: 'category invalida.' })
  category!: ExpenseCategory;

  @ApiProperty({ example: 'Abastecimento posto Graal km 214' })
  @IsString()
  @MinLength(1, { message: 'description e obrigatoria.' })
  @MaxLength(500)
  description!: string;

  @ApiPropertyOptional({ example: 'Posto Graal' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  supplier?: string;

  @ApiPropertyOptional({ example: 'NF-12345' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  documentNumber?: string;

  @ApiProperty({ example: '2026-09-01T10:00:00.000Z' })
  @IsDateString({}, { message: 'expenseDate deve ser uma data valida (ISO 8601).' })
  expenseDate!: string;

  @ApiProperty({ example: 350.5, description: 'Valor da despesa -- deve ser maior que zero.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'amount deve ser maior que zero.' })
  amount!: number;

  @ApiPropertyOptional({
    example: 'BRL',
    default: 'BRL',
    description: 'Codigo ISO 4217 (3 letras).',
  })
  @IsOptional()
  @IsString()
  @Length(3, 3, { message: 'currency deve ter exatamente 3 letras (ex: BRL).' })
  currency?: string;

  @ApiPropertyOptional({ enum: ExpensePaymentMethod })
  @IsOptional()
  @IsEnum(ExpensePaymentMethod, { message: 'paymentMethod invalido.' })
  paymentMethod?: ExpensePaymentMethod;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Vinculo opcional a um Attachment (comprovante) ja existente.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'attachmentId deve ser um UUID valido.' })
  attachmentId?: string;
}
