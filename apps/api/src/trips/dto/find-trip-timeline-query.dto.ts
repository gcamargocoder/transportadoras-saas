import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TRIP_TIMELINE_ORIGINS, TripTimelineOrigin } from '../entities/trip-timeline-event.entity';

// GET /trips/:id/timeline (Fase 67) -- filtros por origem/tipo/periodo,
// ordenacao configuravel. Filtra por occurredAt (data real do evento de
// origem), nunca por qualquer data de importacao/sincronizacao.
export class FindTripTimelineQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TRIP_TIMELINE_ORIGINS })
  @IsOptional()
  @IsIn(TRIP_TIMELINE_ORIGINS, { message: 'origin invalido.' })
  origin?: TripTimelineOrigin;

  @ApiPropertyOptional({ description: 'Subtipo bruto do registro de origem (ex: BREAKDOWN, DEVIATION).' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'order invalido.' })
  order?: 'asc' | 'desc';
}
