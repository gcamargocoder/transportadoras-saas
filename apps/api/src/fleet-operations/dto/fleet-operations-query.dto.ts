import { ApiPropertyOptional } from '@nestjs/swagger';
import { TireStatus, TrailerType, TripStopType, VehicleStatus, VehicleType } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { TRIP_STOP_STATUSES, TripStopStatus } from '../../trip-operations/entities/trip-stop.entity';

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

  // Fase 44 -- driverId/type/status so sao aplicados por
  // GET /fleet-operations/stops (ranking por motorista + alertas de
  // duracao longa); ignorados pelos demais endpoints que compartilham este
  // DTO (mesmo principio ja documentado para fleetId x fuel/tires).
  @ApiPropertyOptional({ format: 'uuid', description: 'Aplicado apenas por GET /fleet-operations/stops.' })
  @IsOptional()
  @IsUUID('4')
  driverId?: string;

  @ApiPropertyOptional({ enum: TripStopType, description: 'Aplicado apenas por GET /fleet-operations/stops.' })
  @IsOptional()
  @IsEnum(TripStopType, { message: 'type invalido.' })
  type?: TripStopType;

  @ApiPropertyOptional({ enum: TRIP_STOP_STATUSES, description: 'Aplicado apenas por GET /fleet-operations/stops.' })
  @IsOptional()
  @IsIn(TRIP_STOP_STATUSES, { message: 'status invalido.' })
  status?: TripStopStatus;

  // Iteracao de redesign visual -- composicao da frota
  // (GET /fleet-operations/vehicles). Nomes distintos de type/status
  // acima (ja reservados para TripStopType/TripStopStatus) para nao
  // colidir na validacao deste DTO compartilhado.
  @ApiPropertyOptional({ enum: VehicleType, description: 'Aplicado apenas por GET /fleet-operations/vehicles.' })
  @IsOptional()
  @IsEnum(VehicleType, { message: 'vehicleType invalido.' })
  vehicleType?: VehicleType;

  @ApiPropertyOptional({ enum: VehicleStatus, description: 'Aplicado apenas por GET /fleet-operations/vehicles.' })
  @IsOptional()
  @IsEnum(VehicleStatus, { message: 'vehicleStatus invalido.' })
  vehicleStatus?: VehicleStatus;

  @ApiPropertyOptional({ enum: TireStatus, description: 'Aplicado apenas por GET /fleet-operations/tires.' })
  @IsOptional()
  @IsEnum(TireStatus, { message: 'tireStatus invalido.' })
  tireStatus?: TireStatus;

  @ApiPropertyOptional({ enum: TrailerType, description: 'Aplicado apenas por GET /fleet-operations/compositions.' })
  @IsOptional()
  @IsEnum(TrailerType, { message: 'trailerType invalido.' })
  trailerType?: TrailerType;
}
