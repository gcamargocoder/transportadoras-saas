import { ApiPropertyOptional } from '@nestjs/swagger';
import { TripStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum TripSortField {
  PLANNED_DEPARTURE = 'plannedDeparture',
  CREATED_AT = 'createdAt',
  PRIORITY = 'priority',
}

export class FindTripsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca livre: observacoes, cliente, origem e destino.' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'customerId deve ser um UUID valido.' })
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'driverId deve ser um UUID valido.' })
  driverId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filtra pelo veiculo da composicao vinculada.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'vehicleId deve ser um UUID valido.' })
  vehicleId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'originLocationId deve ser um UUID valido.' })
  originLocationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'destinationLocationId deve ser um UUID valido.' })
  destinationLocationId?: string;

  @ApiPropertyOptional({ enum: TripStatus })
  @IsOptional()
  @IsEnum(TripStatus)
  status?: TripStatus;

  @ApiPropertyOptional({ description: 'Periodo: partida prevista a partir de (ISO 8601).' })
  @IsOptional()
  @IsDateString()
  departureFrom?: string;

  @ApiPropertyOptional({ description: 'Periodo: partida prevista ate (ISO 8601).' })
  @IsOptional()
  @IsDateString()
  departureTo?: string;

  @ApiPropertyOptional({ enum: TripSortField, default: TripSortField.PLANNED_DEPARTURE })
  @IsOptional()
  @IsEnum(TripSortField)
  sortBy: TripSortField = TripSortField.PLANNED_DEPARTURE;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
