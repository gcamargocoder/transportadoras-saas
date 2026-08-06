import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  VehicleMaintenancePriority,
  VehicleMaintenanceStatus,
  VehicleMaintenanceType,
} from '@prisma/client';
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

export enum MaintenanceSortField {
  OPENED_AT = 'openedAt',
  SCHEDULED_AT = 'scheduledAt',
  CREATED_AT = 'createdAt',
}

export class FindMaintenancesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Busca livre: descricao, observacoes, OS, oficina, fornecedor, mecanico.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @ApiPropertyOptional({ enum: VehicleMaintenanceStatus })
  @IsOptional()
  @IsEnum(VehicleMaintenanceStatus)
  status?: VehicleMaintenanceStatus;

  @ApiPropertyOptional({ enum: VehicleMaintenanceType })
  @IsOptional()
  @IsEnum(VehicleMaintenanceType)
  type?: VehicleMaintenanceType;

  @ApiPropertyOptional({ enum: VehicleMaintenancePriority })
  @IsOptional()
  @IsEnum(VehicleMaintenancePriority)
  priority?: VehicleMaintenancePriority;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por veiculo.' })
  @IsOptional()
  @IsUUID('4', { message: 'vehicleId deve ser um UUID valido.' })
  vehicleId?: string;

  @ApiPropertyOptional({ description: 'Filtra pela placa do veiculo (parcial).' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  plate?: string;

  @ApiPropertyOptional({ description: 'Filtra por oficina (parcial).' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  workshop?: string;

  @ApiPropertyOptional({ description: 'Filtra por fornecedor (parcial).' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  supplier?: string;

  @ApiPropertyOptional({ description: 'Periodo: data de abertura a partir de (inclusive).' })
  @IsOptional()
  @IsDateString({}, { message: 'openedFrom deve ser uma data valida (ISO 8601).' })
  openedFrom?: string;

  @ApiPropertyOptional({ description: 'Periodo: data de abertura ate (inclusive).' })
  @IsOptional()
  @IsDateString({}, { message: 'openedTo deve ser uma data valida (ISO 8601).' })
  openedTo?: string;

  @ApiPropertyOptional({ enum: MaintenanceSortField, default: MaintenanceSortField.OPENED_AT })
  @IsOptional()
  @IsEnum(MaintenanceSortField)
  sortBy: MaintenanceSortField = MaintenanceSortField.OPENED_AT;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
