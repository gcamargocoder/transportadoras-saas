import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripPriority } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

// POST /quotations/:id/convert-to-trip -- so a "proxima etapa" que a
// arquitetura existente realmente suporta (regra 10): a viagem exige
// driverId/compositionId (atribuicao operacional que uma cotacao comercial
// nunca teria), entao esses dados sao pedidos aqui, nunca inventados.
// customerId/originLocationId/destinationLocationId vem da propria
// cotacao -- reaproveita INTEGRALMENTE TripsService.create (nenhuma
// segunda logica de criacao de viagem).
export class ConvertQuotationToTripDto {
  @ApiProperty({ format: 'uuid', description: 'Motorista responsavel pela viagem.' })
  @IsUUID('4', { message: 'driverId deve ser um UUID valido.' })
  driverId!: string;

  @ApiProperty({ format: 'uuid', description: 'Composicao de frota ja cadastrada e livre.' })
  @IsUUID('4', { message: 'compositionId deve ser um UUID valido.' })
  compositionId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  tollRouteId?: string;

  @ApiProperty({ example: '2026-09-10T08:00:00.000Z' })
  @IsDateString({}, { message: 'plannedDeparture deve ser uma data valida (ISO 8601).' })
  plannedDeparture!: string;

  @ApiProperty({ example: '2026-09-11T18:00:00.000Z' })
  @IsDateString({}, { message: 'plannedArrival deve ser uma data valida (ISO 8601).' })
  plannedArrival!: string;

  @ApiPropertyOptional({ enum: TripPriority })
  @IsOptional()
  @IsEnum(TripPriority, { message: 'priority invalida.' })
  priority?: TripPriority;
}
