import { ApiPropertyOptional } from '@nestjs/swagger';
import { TripOccurrenceSeverity, TripOccurrenceType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { TRIP_OCCURRENCE_STATUSES, TripOccurrenceStatus } from '../entities/trip-occurrence.entity';

// GET /trips/:id/occurrences -- lista as ocorrencias desta viagem (nunca
// cross-frota, o escopo ja e a propria viagem da rota).
export class FindTripOccurrencesQueryDto {
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
