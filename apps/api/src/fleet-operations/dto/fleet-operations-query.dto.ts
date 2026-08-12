import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// Mesmo padrao de DashboardQueryDto (dashboard/dto/dashboard-query.dto.ts)
// -- startDate/endDate filtram pela data do EVENTO real de cada dominio
// (supplyDate/openedAt/chargedAt/expenseDate/startedAt), nunca createdAt.
export class FleetOperationsQueryDto {
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
  fleetId?: string;
}
