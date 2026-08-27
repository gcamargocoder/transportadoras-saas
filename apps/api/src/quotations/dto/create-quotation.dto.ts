import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

// Campos de entrada da cotacao. originLocationId/destinationLocationId/
// customerId/validUntil sao obrigatorios (uma cotacao sempre precisa disso
// para existir); os demais -- inclusive todos os modificadores de calculo
// (nightService/riskCargo/dailyCount/demurrageCount/freightTableId, mesmo
// formato de FreightCalculationInputDto/SimulateFreightDto, Fase 59) --
// sao opcionais. manualAmount so e exigido quando o motor nao encontra
// tabela/regra aplicavel (regra 4 da Fase 94); quando informado mesmo com
// calculo disponivel, prevalece sobre o valor do motor (decisao comercial
// humana, mesmo espirito de TripFreight.contractedAmount).
export class CreateQuotationDto {
  @ApiProperty({ format: 'uuid', description: 'Cliente solicitante.' })
  @IsUUID('4', { message: 'customerId deve ser um UUID valido.' })
  customerId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Contato do cliente (Fase 93) que fez a solicitacao.' })
  @IsOptional()
  @IsUUID('4', { message: 'customerContactId deve ser um UUID valido.' })
  customerContactId?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'originLocationId deve ser um UUID valido.' })
  originLocationId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'destinationLocationId deve ser um UUID valido.' })
  destinationLocationId!: string;

  @ApiPropertyOptional({ example: 'GRANEL' })
  @IsOptional()
  @IsString()
  cargoType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  weightKg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cubageM3?: number;

  @ApiPropertyOptional({ enum: VehicleType })
  @IsOptional()
  @IsEnum(VehicleType, { message: 'vehicleType invalido.' })
  vehicleType?: VehicleType;

  @ApiPropertyOptional({ description: 'Condicoes comerciais e observacoes em texto livre.' })
  @IsOptional()
  @IsString()
  conditions?: string;

  @ApiProperty({ example: '2026-09-15T00:00:00.000Z', description: 'Data-limite de validade da cotacao.' })
  @IsDateString({}, { message: 'validUntil deve ser uma data valida (ISO 8601).' })
  validUntil!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Restringe o calculo automatico a uma tabela de frete especifica do cliente.',
  })
  @IsOptional()
  @IsUUID('4')
  freightTableId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  nightService?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  riskCargo?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dailyCount?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  demurrageCount?: number;

  @ApiPropertyOptional({
    description:
      'Valor informado manualmente. Obrigatorio quando o motor de precificacao nao encontra tabela/regra ' +
      'aplicavel; quando informado mesmo com calculo disponivel, prevalece sobre o valor do motor.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  manualAmount?: number;
}
