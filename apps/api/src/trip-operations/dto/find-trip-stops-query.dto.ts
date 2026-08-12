import { ApiPropertyOptional } from '@nestjs/swagger';
import { TripStopType } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TRIP_STOP_STATUSES, TripStopStatus } from '../entities/trip-stop.entity';

// GET /trip-stops (Fase 43) -- lista paginada cross-frota. Filtra por
// startedAt (data do evento real), nunca createdAt -- mesmo principio ja
// usado em fuel-supplies/fleet-operations.
export class FindTripStopsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
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

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  tripId?: string;

  @ApiPropertyOptional({ enum: TripStopType })
  @IsOptional()
  @IsEnum(TripStopType, { message: 'type invalido.' })
  type?: TripStopType;

  @ApiPropertyOptional({ enum: TRIP_STOP_STATUSES })
  @IsOptional()
  @IsIn(TRIP_STOP_STATUSES, { message: 'status invalido.' })
  status?: TripStopStatus;
}
