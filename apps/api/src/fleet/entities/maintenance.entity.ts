import { ApiProperty } from '@nestjs/swagger';
import {
  VehicleMaintenancePriority,
  VehicleMaintenanceStatus,
  VehicleMaintenanceType,
} from '@prisma/client';

export class MaintenanceEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty({ enum: VehicleMaintenanceType })
  type!: VehicleMaintenanceType;

  @ApiProperty({ enum: VehicleMaintenanceStatus })
  status!: VehicleMaintenanceStatus;

  @ApiProperty({ enum: VehicleMaintenancePriority })
  priority!: VehicleMaintenancePriority;

  @ApiProperty({ description: 'Data de abertura da manutencao.' })
  openedAt!: Date;

  @ApiProperty({ nullable: true, description: 'Data prevista de conclusao.' })
  scheduledAt!: Date | null;

  @ApiProperty({ nullable: true, description: 'Data em que a manutencao foi concluida.' })
  completedAt!: Date | null;

  @ApiProperty({ nullable: true, description: 'Quilometragem do veiculo no momento do registro.' })
  odometerKm!: number | null;

  @ApiProperty({ nullable: true })
  workshop!: string | null;

  @ApiProperty({ nullable: true })
  supplier!: string | null;

  @ApiProperty({ nullable: true })
  mechanic!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Usuario interno responsavel.' })
  responsibleUserId!: string | null;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ nullable: true })
  notes!: string | null;

  @ApiProperty({ nullable: true, description: 'Valor da mao de obra.' })
  laborCost!: number | null;

  @ApiProperty({ nullable: true, description: 'Valor das pecas.' })
  partsCost!: number | null;

  @ApiProperty({ nullable: true, description: 'Calculado automaticamente: laborCost + partsCost.' })
  totalCost!: number | null;

  @ApiProperty({ nullable: true })
  serviceOrderNumber!: string | null;

  @ApiProperty({ nullable: true, description: 'Garantia valida ate esta data.' })
  warrantyUntil!: Date | null;

  @ApiProperty({ nullable: true, description: 'Data prevista da proxima revisao.' })
  nextReviewAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
