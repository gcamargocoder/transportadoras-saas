import { ApiPropertyOptional } from '@nestjs/swagger';
import { TripStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// Fase 103 -- "selecionar viagens elegiveis para faturamento": mesmo escopo
// operacional de FindTripBillingsQueryDto (cliente/frota/veiculo/motorista),
// mais o filtro opcional por status da viagem (o pedido enfatiza "viagens
// concluidas", mas a regra de elegibilidade em si -- ver
// BillingListService.findEligibleTrips -- nunca exige status=COMPLETED,
// pois o faturamento ja funciona hoje independente do status da viagem,
// desde a Fase 60; este filtro e so uma conveniencia de busca).
export class FindEligibleTripsQueryDto extends PaginationQueryDto {
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

  @ApiPropertyOptional({ enum: TripStatus })
  @IsOptional()
  @IsEnum(TripStatus, { message: 'tripStatus invalido.' })
  tripStatus?: TripStatus;
}
