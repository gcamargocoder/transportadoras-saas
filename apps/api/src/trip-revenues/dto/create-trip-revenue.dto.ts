import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RevenueCategory } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTripRevenueDto {
  @ApiProperty({ format: 'uuid', description: 'Viagem a qual a receita pertence.' })
  @IsUUID('4', { message: 'tripId deve ser um UUID valido.' })
  tripId!: string;

  @ApiProperty({ enum: RevenueCategory, example: RevenueCategory.FREIGHT })
  @IsEnum(RevenueCategory, { message: 'category invalida.' })
  category!: RevenueCategory;

  @ApiProperty({ example: 'Frete SP -> RJ' })
  @IsString()
  @MinLength(1, { message: 'description e obrigatoria.' })
  @MaxLength(500)
  description!: string;

  @ApiProperty({ example: 4500, description: 'Valor da receita -- nunca pode ser negativo.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'amount nao pode ser negativo.' })
  amount!: number;

  @ApiProperty({ example: '2026-09-05T10:00:00.000Z' })
  @IsDateString({}, { message: 'receivedAt deve ser uma data valida (ISO 8601).' })
  receivedAt!: string;

  @ApiPropertyOptional({ example: 'NF-98765' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  invoiceNumber?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Cliente relacionado (opcional).' })
  @IsOptional()
  @IsUUID('4', { message: 'customerId deve ser um UUID valido.' })
  customerId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Vinculo opcional a um Attachment (comprovante) ja existente.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'attachmentId deve ser um UUID valido.' })
  attachmentId?: string;
}
