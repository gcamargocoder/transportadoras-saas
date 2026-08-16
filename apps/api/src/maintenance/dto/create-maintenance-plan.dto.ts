import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MaintenanceComponent, VehicleMaintenanceType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, MaxLength } from 'class-validator';

// Fase 45 -- regra de recorrencia PREVENTIVA por veiculo/componente. Nao
// gera VehicleMaintenance automaticamente -- so alimenta o calculo de
// vencidas/proximas (ver FleetOperationsMetricsService). Validacao de "pelo
// menos um intervalo informado" fica no service (nao da para expressar
// "OR" entre campos com class-validator sem um validator customizado).
export class CreateMaintenancePlanDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'vehicleId deve ser um UUID valido.' })
  vehicleId!: string;

  @ApiProperty({ example: 'Troca de óleo do motor' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ enum: MaintenanceComponent })
  @IsEnum(MaintenanceComponent, { message: 'component invalido.' })
  component!: MaintenanceComponent;

  @ApiPropertyOptional({ enum: VehicleMaintenanceType, default: VehicleMaintenanceType.PREVENTIVE })
  @IsOptional()
  @IsEnum(VehicleMaintenanceType, { message: 'maintenanceType invalido.' })
  maintenanceType?: VehicleMaintenanceType;

  @ApiPropertyOptional({ example: 10000, description: 'Intervalo em quilometros.' })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'intervalKm deve ser maior que zero.' })
  intervalKm?: number;

  @ApiPropertyOptional({ example: 180, description: 'Intervalo em dias.' })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'intervalDays deve ser maior que zero.' })
  intervalDays?: number;

  @ApiPropertyOptional({ example: 500, description: 'Intervalo em horas de motor.' })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'intervalHours deve ser maior que zero.' })
  intervalHours?: number;

  @ApiPropertyOptional({ example: 1000, description: 'Antecedencia (km) para o alerta de vencimento proximo.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  alertBeforeKm?: number;

  @ApiPropertyOptional({ example: 15, description: 'Antecedencia (dias) para o alerta de vencimento proximo.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  alertBeforeDays?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
