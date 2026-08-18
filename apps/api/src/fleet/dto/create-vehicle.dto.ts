import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleFuelType, VehicleOwnershipType, VehicleType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsChassisNumber } from '../validators/is-chassis-number.validator';
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

  @ApiPropertyOptional({
    example: '9BWZZZ377VT004251',
    description: 'Chassi (VIN, 17 caracteres alfanumericos, sem I/O/Q).',
  })
  @IsOptional()
  @IsChassisNumber()
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

  @ApiPropertyOptional({
    enum: VehicleOwnershipType,
    default: VehicleOwnershipType.OWN,
    description: 'Classificacao de propriedade: proprio, agregado ou terceiro.',
  })
  @IsOptional()
  @IsEnum(VehicleOwnershipType, { message: 'ownershipType invalido.' })
  ownershipType?: VehicleOwnershipType;

  @ApiPropertyOptional({ enum: VehicleFuelType, example: VehicleFuelType.DIESEL_S10 })
  @IsOptional()
  @IsEnum(VehicleFuelType, { message: 'fuelType invalido.' })
  fuelType?: VehicleFuelType;

  @ApiPropertyOptional({ example: 400, description: 'Capacidade do tanque, em litros.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'tankCapacityLiters deve ser maior que zero quando informado.' })
  tankCapacityLiters?: number;

  @ApiPropertyOptional({ example: 3.5, description: 'Consumo medio, em km/litro.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'averageConsumptionKmL deve ser maior que zero quando informado.' })
  averageConsumptionKmL?: number;

  @ApiPropertyOptional({ example: 120000, description: 'Quilometragem atual do veiculo.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'odometerKm deve ser maior ou igual a zero.' })
  odometerKm?: number;

  @ApiPropertyOptional({ example: 23000, description: 'Peso Bruto Total (PBT), em kg.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'grossWeightKg deve ser maior que zero quando informado.' })
  grossWeightKg?: number;

  @ApiPropertyOptional({ example: 8000, description: 'Peso liquido (tara), em kg.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'netWeightKg deve ser maior que zero quando informado.' })
  netWeightKg?: number;

  @ApiPropertyOptional({ example: 15000, description: 'Capacidade de carga, em kg.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'cargoCapacityKg deve ser maior que zero quando informado.' })
  cargoCapacityKg?: number;

  @ApiPropertyOptional({ example: 3, description: 'Quantidade de eixos do veiculo.' })
  @IsOptional()
  @IsInt()
  @Min(2, { message: 'axleCount deve ser no minimo 2.' })
  axleCount?: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
