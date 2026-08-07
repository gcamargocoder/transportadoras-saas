import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripPriority } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PlannedTripMetricsDto } from './planned-trip-metrics.dto';

export class CreateTripDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Cliente (embarcador).' })
  @IsOptional()
  @IsUUID('4', { message: 'customerId deve ser um UUID valido.' })
  customerId?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'originLocationId deve ser um UUID valido.' })
  originLocationId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'destinationLocationId deve ser um UUID valido.' })
  destinationLocationId!: string;

  @ApiProperty({ format: 'uuid', description: 'Motorista responsavel pela viagem.' })
  @IsUUID('4', { message: 'driverId deve ser um UUID valido.' })
  driverId!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'Composicao de frota ja cadastrada (cavalo mecanico + implementos, ver POST ' +
      '/trip-compositions). Precisa estar livre (sem viagem vinculada).',
  })
  @IsUUID('4', { message: 'compositionId deve ser um UUID valido.' })
  compositionId!: string;

  @ApiProperty({ example: '2026-03-10T08:00:00.000Z' })
  @IsDateString({}, { message: 'plannedDeparture deve ser uma data valida (ISO 8601).' })
  plannedDeparture!: string;

  @ApiProperty({ example: '2026-03-11T18:00:00.000Z' })
  @IsDateString({}, { message: 'plannedArrival deve ser uma data valida (ISO 8601).' })
  plannedArrival!: string;

  @ApiPropertyOptional({ enum: TripPriority, default: TripPriority.NORMAL })
  @IsOptional()
  @IsEnum(TripPriority, { message: 'priority invalida.' })
  priority?: TripPriority;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ type: PlannedTripMetricsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlannedTripMetricsDto)
  plannedMetrics?: PlannedTripMetricsDto;
}
