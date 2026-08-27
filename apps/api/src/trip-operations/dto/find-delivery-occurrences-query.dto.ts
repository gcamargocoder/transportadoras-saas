import { ApiPropertyOptional } from '@nestjs/swagger';
import { TripOccurrenceSeverity, TripOccurrenceType } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TRIP_OCCURRENCE_STATUSES, TripOccurrenceStatus } from '../entities/trip-occurrence.entity';

// GET /delivery-occurrences (Fase 101) -- listagem operacional CROSS-TRIP,
// SEMPRE restrita a ocorrencias vinculadas a uma TripDeliveryStop (a base
// where do service sempre exige tripDeliveryStopId != null -- e o que
// distingue "ocorrencias de entrega" das ocorrencias gerais de viagem, ja
// cobertas por GET /trips/:id/occurrences). Mesmo padrao de
// FindDeliveryStopsQueryDto (Fase 99).
export class FindDeliveryOccurrencesQueryDto extends PaginationQueryDto {
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

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  tripId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  tripDeliveryStopId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  driverId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @ApiPropertyOptional({ description: 'Busca por texto na descricao da ocorrencia.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ description: 'Periodo: occurredAt a partir de (ISO 8601 ou data).' })
  @IsOptional()
  @IsDateString()
  occurredFrom?: string;

  @ApiPropertyOptional({ description: 'Periodo: occurredAt ate (ISO 8601 ou data).' })
  @IsOptional()
  @IsDateString()
  occurredTo?: string;
}
