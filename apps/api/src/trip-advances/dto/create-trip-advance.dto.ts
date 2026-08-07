import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpensePaymentMethod } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

// driverId NAO faz parte deste DTO -- e SEMPRE derivado da Trip (nunca
// aceito do cliente), mesmo principio ja aplicado em TripExpense/
// TollTransaction (ver TripAdvancesService.create).
export class CreateTripAdvanceDto {
  @ApiProperty({ format: 'uuid', description: 'Viagem a qual o adiantamento pertence.' })
  @IsUUID('4', { message: 'tripId deve ser um UUID valido.' })
  tripId!: string;

  @ApiProperty({ example: 'Adiantamento para combustivel e pedagio' })
  @IsString()
  @MinLength(1, { message: 'description e obrigatoria.' })
  @MaxLength(500)
  description!: string;

  @ApiProperty({ example: 500, description: 'Valor do adiantamento -- deve ser maior que zero.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'amount deve ser maior que zero.' })
  amount!: number;

  @ApiPropertyOptional({ enum: ExpensePaymentMethod })
  @IsOptional()
  @IsEnum(ExpensePaymentMethod, { message: 'paymentMethod invalido.' })
  paymentMethod?: ExpensePaymentMethod;

  @ApiProperty({ example: '2026-09-01T08:00:00.000Z' })
  @IsDateString({}, { message: 'paidAt deve ser uma data valida (ISO 8601).' })
  paidAt!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Vinculo opcional a um Attachment (comprovante) ja existente.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'attachmentId deve ser um UUID valido.' })
  attachmentId?: string;
}
