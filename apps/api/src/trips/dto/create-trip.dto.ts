import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripLoadStatus, TripPriority } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PlannedTripMetricsDto } from './planned-trip-metrics.dto';

export class CreateTripDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Cliente (embarcador).' })
  @IsOptional()
  @IsUUID('4', { message: 'customerId deve ser um UUID valido.' })
  customerId?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'originLocationId deve ser um UUID valido.' })
  originLocationId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'destinationLocationId deve ser um UUID valido.' })
  destinationLocationId!: string;

  @ApiProperty({ format: 'uuid', description: 'Motorista responsavel pela viagem.' })
  @IsUUID('4', { message: 'driverId deve ser um UUID valido.' })
  driverId!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'Composicao de frota ja cadastrada (cavalo mecanico + implementos, ver POST ' +
      '/trip-compositions). Precisa estar livre (sem viagem vinculada).',
  })
  @IsUUID('4', { message: 'compositionId deve ser um UUID valido.' })
  compositionId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Rota de pedagio (Fase 23, ver POST /toll-routes) -- determina as pracas esperadas ' +
      'para a conciliacao. Opcional: a viagem funciona normalmente sem rota vinculada.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'tollRouteId deve ser um UUID valido.' })
  tollRouteId?: string;

  @ApiProperty({ example: '2026-03-10T08:00:00.000Z' })
  @IsDateString({}, { message: 'plannedDeparture deve ser uma data valida (ISO 8601).' })
  plannedDeparture!: string;

  @ApiProperty({ example: '2026-03-11T18:00:00.000Z' })
  @IsDateString({}, { message: 'plannedArrival deve ser uma data valida (ISO 8601).' })
  plannedArrival!: string;

  @ApiPropertyOptional({ enum: TripPriority, default: TripPriority.NORMAL })
  @IsOptional()
  @IsEnum(TripPriority, { message: 'priority invalida.' })
  priority?: TripPriority;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Fase D -- viagem de IDA que originou este retorno (vinculo EXPLICITO, so quando o operador ' +
      'informa). Cada retorno continua sendo uma Trip independente. Nao altera status, composicao, ' +
      'actualDeparture/actualArrival nem loadStatus.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'previousTripId deve ser um UUID valido.' })
  previousTripId?: string;

  @ApiPropertyOptional({
    enum: TripLoadStatus,
    description:
      'Fase D -- INTENCAO de carga do planejamento (LOADED = retorno planejado carregado; EMPTY = ' +
      'retorno planejado vazio). NAO substitui loadStatus (valor real da largada) e nunca gera ' +
      'inferencia automatica.',
  })
  @IsOptional()
  @IsEnum(TripLoadStatus, { message: 'plannedLoadStatus invalido.' })
  plannedLoadStatus?: TripLoadStatus;

  @ApiPropertyOptional({ type: PlannedTripMetricsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlannedTripMetricsDto)
  plannedMetrics?: PlannedTripMetricsDto;
}
