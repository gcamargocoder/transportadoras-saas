import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FuelType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

// Tela de abastecimento do app do motorista (Fase 25): "KM atual" + "Litros",
// somente. Nunca pede posto/cidade/endereco/data/hora/coordenadas -- tudo
// isso e derivado automaticamente (viagem, veiculo, motorista, timestamp do
// dispositivo, localizacao GPS quando disponivel). fuelStationId nao existe
// neste DTO: o service so registra a localizacao quando nao ha posto
// identificado (nunca inventa o nome do posto). pricePerLiter e opcional --
// quando o motorista nao sabe/nao digita, fica 0 e e completado depois pelo
// administrativo (PATCH) a partir do cupom fiscal, sem bloquear o registro
// em campo.
export class CreateDriverFuelSupplyDto {
  @ApiProperty({
    description: 'Id gerado pelo dispositivo -- garante idempotencia ao reenviar apos reconexao.',
  })
  @IsString()
  deviceEventId!: string;

  @ApiProperty({ example: 125000, description: 'KM atual informado pelo motorista.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'odometerKm nao pode ser negativo.' })
  odometerKm!: number;

  @ApiProperty({ example: 250.5, description: 'Litros abastecidos -- deve ser maior que zero.' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive({ message: 'liters deve ser maior que zero.' })
  liters!: number;

  @ApiPropertyOptional({
    enum: FuelType,
    default: FuelType.OUTRO,
    description: 'Quando o motorista nao souber informar, assume OUTRO.',
  })
  @IsOptional()
  @IsEnum(FuelType, { message: 'fuelType invalido.' })
  fuelType?: FuelType;

  @ApiPropertyOptional({
    description: 'Preco por litro, quando o motorista souber -- opcional (ver doc da classe).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  pricePerLiter?: number;

  @ApiPropertyOptional({ example: '2026-09-02T14:00:00.000Z', description: 'Timestamp do dispositivo -- se omitido, usa o momento do recebimento.' })
  @IsOptional()
  @IsDateString({}, { message: 'supplyDate deve ser uma data valida (ISO 8601).' })
  supplyDate?: string;

  @ApiPropertyOptional({ description: 'Latitude no momento do abastecimento (GPS).' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitude no momento do abastecimento (GPS).' })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}
