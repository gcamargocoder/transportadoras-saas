import { ApiPropertyOptional } from '@nestjs/swagger';
import { TripBillingStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

// Mesmo escopo operacional ja usado por FleetOperationsQueryDto/
// FindFreightDashboardQueryDto (periodo + cliente/frota/veiculo/
// motorista/status) -- DTO proprio do modulo, mesmo padrao ja
// estabelecido nas Fases 52/59 de nao importar literalmente o DTO de
// outro dominio.
export class FindBillingQueryBaseDto {
  @ApiPropertyOptional({ example: '2026-08-01', description: 'Filtra por TripBilling.createdAt >= startDate.' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-08-31', description: 'Filtra por TripBilling.createdAt <= endDate.' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Vehicle.fleetId (via Trip.composition.vehicle).' })
  @IsOptional()
  @IsUUID('4')
  fleetId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Trip.composition.vehicleId.' })
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Trip.driverId.' })
  @IsOptional()
  @IsUUID('4')
  driverId?: string;

  @ApiPropertyOptional({ enum: TripBillingStatus })
  @IsOptional()
  @IsEnum(TripBillingStatus, { message: 'status invalido.' })
  status?: TripBillingStatus;
}
