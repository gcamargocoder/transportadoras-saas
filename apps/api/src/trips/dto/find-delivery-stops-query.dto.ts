import { ApiPropertyOptional } from '@nestjs/swagger';
import { TripDeliveryStopStatus } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ParseBooleanQuery } from '../../common/decorators/parse-boolean-query.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// Fase 99 -- listagem/dashboard CROSS-TRIP das entregas (TripDeliveryStop),
// mesmo padrao de FindEmptyTripsQueryDto/FindTripsQueryDto: filtros
// server-side, paginacao sempre no banco. `late` e mutuamente exclusivo com
// `status` (ver TripDeliveryStopsService.findAll) -- representa "ainda
// aberta e com plannedArrival no passado", nunca um status persistido.
export class FindDeliveryStopsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TripDeliveryStopStatus })
  @IsOptional()
  @IsEnum(TripDeliveryStopStatus, { message: 'status invalido.' })
  status?: TripDeliveryStopStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'customerId deve ser um UUID valido.' })
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'tripId deve ser um UUID valido.' })
  tripId?: string;

  @ApiPropertyOptional({ description: 'Busca por nome do cliente/destinatario ou do local de entrega.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ description: 'Periodo: previsao de chegada (plannedArrival) a partir de (ISO 8601 ou data).' })
  @IsOptional()
  @IsDateString()
  plannedFrom?: string;

  @ApiPropertyOptional({ description: 'Periodo: previsao de chegada (plannedArrival) ate (ISO 8601 ou data).' })
  @IsOptional()
  @IsDateString()
  plannedTo?: string;

  @ApiPropertyOptional({
    description: 'true = somente entregas atrasadas (PENDING/IN_PROGRESS com plannedArrival no passado).',
  })
  @IsOptional()
  @ParseBooleanQuery()
  @IsBoolean()
  late?: boolean;
}
