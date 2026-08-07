import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// Filtros aplicados apenas onde fazem sentido em cada secao do dashboard
// (ver DashboardService) -- startDate/endDate nunca afetam "charts" (que
// sempre mostram os ultimos 12 meses) nem metricas de "hoje"/estado atual
// (todayTrips, lateTrips, tripsInProgress, completedToday).
export class DashboardQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

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
  customerId?: string;
}
