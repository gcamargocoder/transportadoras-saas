import { ApiPropertyOptional } from '@nestjs/swagger';
import { TripOccurrenceSeverity, TripOccurrenceType } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { TRIP_OCCURRENCE_STATUSES, TripOccurrenceStatus } from '../../trip-operations/entities/trip-occurrence.entity';

// GET /fleet-operations/occurrences (Fase 68). DTO proprio (nao reaproveita
// FleetOperationsQueryDto): from/to/type/status daquele DTO compartilhado
// ja tem outro significado (startDate/endDate, TripStopType, TripStopStatus
// OPEN/COMPLETED/CANCELLED -- RESOLVED nao existiria la), reaproveitar
// colidiria em vez de simplificar.
export class FindFleetOccurrencesQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  driverId?: string;

  @ApiPropertyOptional({ enum: TripOccurrenceType })
  @IsOptional()
  @IsEnum(TripOccurrenceType, { message: 'type invalido.' })
  type?: TripOccurrenceType;

  @ApiPropertyOptional({ enum: TripOccurrenceSeverity })
  @IsOptional()
  @IsEnum(TripOccurrenceSeverity, { message: 'severity invalido.' })
  severity?: TripOccurrenceSeverity;

  @ApiPropertyOptional({ enum: TRIP_OCCURRENCE_STATUSES })
  @IsOptional()
  @IsIn(TRIP_OCCURRENCE_STATUSES, { message: 'status invalido.' })
  status?: TripOccurrenceStatus;
}
