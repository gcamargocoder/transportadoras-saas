import { ApiPropertyOptional } from '@nestjs/swagger';
import { TripStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// Mesmo padrao de FindTripsQueryDto (Fase 14) -- filtros server-side
// compatíveis com o resto do sistema. `reason` (motivo) NAO e filtravel
// nesta fase: e um campo CALCULADO (nunca uma coluna indexada), filtrar por
// ele exigiria carregar e classificar todas as viagens vazias do tenant
// antes de paginar -- deliberadamente fora de escopo (ver
// docs/trip-empty-runs.md, secao "Limitacoes").
export class FindEmptyTripsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'driverId deve ser um UUID valido.' })
  driverId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra pelo veiculo da composicao vinculada.' })
  @IsOptional()
  @IsUUID('4', { message: 'vehicleId deve ser um UUID valido.' })
  vehicleId?: string;

  @ApiPropertyOptional({ enum: TripStatus })
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @ApiPropertyOptional({ description: 'Periodo: partida REAL a partir de (ISO 8601).' })
  @IsOptional()
  @IsDateString()
  departureFrom?: string;

  @ApiPropertyOptional({ description: 'Periodo: partida REAL ate (ISO 8601).' })
  @IsOptional()
  @IsDateString()
  departureTo?: string;
}
