import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MaintenanceComponent, VehicleMaintenancePriority, VehicleMaintenanceType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MaintenancePartInputDto } from './maintenance-part-input.dto';

// status/completedAt/totalCost NAO fazem parte deste DTO de proposito:
// status nasce sempre OPEN e so muda via PATCH /maintenances/:id/status
// (mesmo padrao ja usado em Vehicle/Driver); totalCost e sempre calculado
// pelo service a partir de laborCost + partsCost, nunca aceito do cliente.
export class CreateMaintenanceDto {
  @ApiProperty({ format: 'uuid', description: 'Veiculo ao qual a manutencao pertence.' })
  @IsUUID('4', { message: 'vehicleId deve ser um UUID valido.' })
  vehicleId!: string;

  @ApiProperty({ enum: VehicleMaintenanceType, example: VehicleMaintenanceType.PREVENTIVE })
  @IsEnum(VehicleMaintenanceType, { message: 'type invalido.' })
  type!: VehicleMaintenanceType;

  @ApiPropertyOptional({
    enum: VehicleMaintenancePriority,
    default: VehicleMaintenancePriority.MEDIUM,
  })
  @IsOptional()
  @IsEnum(VehicleMaintenancePriority, { message: 'priority invalida.' })
  priority?: VehicleMaintenancePriority;

  @ApiPropertyOptional({
    example: '2026-08-06',
    description: 'Data de abertura (default: agora, no momento da criacao).',
  })
  @IsOptional()
  @IsDateString({}, { message: 'openedAt deve ser uma data valida (ISO 8601).' })
  openedAt?: string;

  @ApiPropertyOptional({ example: '2026-08-10', description: 'Data prevista de conclusao.' })
  @IsOptional()
  @IsDateString({}, { message: 'scheduledAt deve ser uma data valida (ISO 8601).' })
  scheduledAt?: string;

  @ApiPropertyOptional({ example: 125000, description: 'Quilometragem do veiculo no registro.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'odometerKm deve ser maior ou igual a zero.' })
  odometerKm?: number;

  @ApiPropertyOptional({ example: 'Oficina Central Diesel' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  workshop?: string;

  @ApiPropertyOptional({ example: 'Volvo Pecas e Servicos' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  supplier?: string;

  @ApiPropertyOptional({ example: 'Joao Mecanico' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  mechanic?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Usuario interno responsavel (opcional).' })
  @IsOptional()
  @IsUUID('4', { message: 'responsibleUserId deve ser um UUID valido.' })
  responsibleUserId?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ example: 350.5, description: 'Valor da mao de obra.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'laborCost nao pode ser negativo.' })
  laborCost?: number;

  @ApiPropertyOptional({ example: 890, description: 'Valor das pecas.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'partsCost nao pode ser negativo.' })
  partsCost?: number;

  @ApiPropertyOptional({ example: 'OS-2026-00123' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  serviceOrderNumber?: string;

  @ApiPropertyOptional({ example: '2027-08-06', description: 'Garantia valida ate esta data.' })
  @IsOptional()
  @IsDateString({}, { message: 'warrantyUntil deve ser uma data valida (ISO 8601).' })
  warrantyUntil?: string;

  @ApiPropertyOptional({ example: '2027-02-06', description: 'Data prevista da proxima revisao.' })
  @IsOptional()
  @IsDateString({}, { message: 'nextReviewAt deve ser uma data valida (ISO 8601).' })
  nextReviewAt?: string;

  @ApiPropertyOptional({ enum: MaintenanceComponent, description: 'Item/sistema do veiculo alvo desta manutencao.' })
  @IsOptional()
  @IsEnum(MaintenanceComponent, { message: 'component invalido.' })
  component?: MaintenanceComponent;

  @ApiPropertyOptional({ example: 135000, description: 'Quilometragem prevista da proxima manutencao deste componente.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'nextOdometerKm deve ser maior ou igual a zero.' })
  nextOdometerKm?: number;

  @ApiPropertyOptional({ example: 240, description: 'Tempo de veiculo parado (minutos), informado explicitamente.' })
  @IsOptional()
  @IsInt()
  @Min(0, { message: 'downtimeMinutes nao pode ser negativo.' })
  downtimeMinutes?: number;

  @ApiPropertyOptional({ example: 'NF-000123456' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  invoiceNumber?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Plano de manutencao preventiva que este registro cumpre.' })
  @IsOptional()
  @IsUUID('4', { message: 'maintenancePlanId deve ser um UUID valido.' })
  maintenancePlanId?: string;

  @ApiPropertyOptional({
    type: [MaintenancePartInputDto],
    description: 'Pecas itemizadas. Quando informado, substitui a lista inteira e recalcula partsCost como a soma.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaintenancePartInputDto)
  parts?: MaintenancePartInputDto[];
}
