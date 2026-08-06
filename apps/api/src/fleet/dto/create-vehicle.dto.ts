import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsRenavam } from '../validators/is-renavam.validator';
import { IsVehiclePlate } from '../validators/is-vehicle-plate.validator';

const MIN_VEHICLE_YEAR = 1950;
const currentYear = new Date().getFullYear();

export class CreateVehicleDto {
  @ApiProperty({ example: 'ABC1D23', description: 'Placa (formato antigo ou Mercosul).' })
  @IsVehiclePlate()
  plate!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Frota associada (opcional).' })
  @IsOptional()
  @IsUUID('4', { message: 'fleetId deve ser um UUID valido.' })
  fleetId?: string;

  @ApiPropertyOptional({ example: '00123456789', description: 'RENAVAM (9 a 11 digitos).' })
  @IsOptional()
  @IsRenavam()
  renavam?: string;

  @ApiPropertyOptional({ example: '9BWZZZ377VT004251' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  chassisNumber?: string;

  @ApiProperty({ example: 'Volvo' })
  @IsString()
  @MinLength(2, { message: 'brand deve ter no minimo 2 caracteres.' })
  @MaxLength(50)
  brand!: string;

  @ApiProperty({ example: 'FH 540' })
  @IsString()
  @MinLength(1, { message: 'model deve ter no minimo 1 caractere.' })
  @MaxLength(50)
  model!: string;

  @ApiPropertyOptional({ example: 2023 })
  @IsOptional()
  @IsInt()
  @Min(MIN_VEHICLE_YEAR, { message: `manufactureYear deve ser >= ${MIN_VEHICLE_YEAR}.` })
  @Max(currentYear + 1, {
    message: 'manufactureYear nao pode ser um ano futuro alem do proximo modelo.',
  })
  manufactureYear?: number;

  @ApiPropertyOptional({ example: 2024 })
  @IsOptional()
  @IsInt()
  @Min(MIN_VEHICLE_YEAR, { message: `modelYear deve ser >= ${MIN_VEHICLE_YEAR}.` })
  @Max(currentYear + 1, { message: 'modelYear nao pode ser um ano futuro alem do proximo modelo.' })
  modelYear?: number;

  @ApiPropertyOptional({ example: 'Branco' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  color?: string;

  @ApiProperty({ enum: VehicleType, example: VehicleType.TRACTOR_UNIT })
  @IsEnum(VehicleType, { message: 'type invalido.' })
  type!: VehicleType;

  @ApiPropertyOptional({ example: 'Cavalo Trucado', description: 'Classificacao livre adicional.' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
