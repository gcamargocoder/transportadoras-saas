import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

// from/to filtram Trip.plannedDeparture (mesmo campo sempre presente em
// Trip, nunca ambiguo entre viagens planejadas/concluidas -- ver
// CustomerProfitabilityService). Sem periodo informado, considera todas as
// viagens do tenant.
export class FindCustomerProfitabilityDashboardQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
