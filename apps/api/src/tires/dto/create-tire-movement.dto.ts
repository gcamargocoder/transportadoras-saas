import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TireLocationType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  ValidateIf,
} from 'class-validator';

// newVehicleId/newTrailerId sao condicionais ao newLocationType informado
// (mesmo padrao ja usado em CreateFuelSupplyDto para vehicleId/driverId
// condicionais a tripId) -- o service ainda valida a existencia do
// veiculo/carreta no tenant antes de aplicar a movimentacao.
export class CreateTireMovementDto {
  @ApiProperty({ enum: TireLocationType, example: TireLocationType.VEHICLE })
  @IsEnum(TireLocationType, { message: 'newLocationType invalido.' })
  newLocationType!: TireLocationType;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Obrigatorio quando newLocationType = VEHICLE.',
  })
  @ValidateIf((dto: CreateTireMovementDto) => dto.newLocationType === TireLocationType.VEHICLE)
  @IsUUID('4', { message: 'newVehicleId deve ser um UUID valido.' })
  newVehicleId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Obrigatorio quando newLocationType = TRAILER.',
  })
  @ValidateIf((dto: CreateTireMovementDto) => dto.newLocationType === TireLocationType.TRAILER)
  @IsUUID('4', { message: 'newTrailerId deve ser um UUID valido.' })
  newTrailerId?: string;

  @ApiPropertyOptional({ example: 'Dianteiro Esquerdo' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  newPosition?: string;

  @ApiPropertyOptional({ example: 125430 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'odometerKm nao pode ser negativo.' })
  odometerKm?: number;

  @ApiPropertyOptional({ example: 'Rodizio programado' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ example: '2026-09-02T10:00:00.000Z', description: 'Default: agora.' })
  @IsOptional()
  @IsDateString({}, { message: 'movementDate deve ser uma data valida (ISO 8601).' })
  movementDate?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Fase 109 -- vinculo opcional com a OS (VehicleMaintenance) que motivou esta troca, quando ' +
      'aplicavel. Mesmo padrao de MaintenancePartInputDto.partId: ausente = movimentacao avulsa.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'maintenanceId deve ser um UUID valido.' })
  maintenanceId?: string;
}
