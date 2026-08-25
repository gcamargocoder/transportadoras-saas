import { ApiProperty } from '@nestjs/swagger';
import {
  MaintenanceComponent,
  VehicleMaintenancePriority,
  VehicleMaintenanceStatus,
  VehicleMaintenanceType,
} from '@prisma/client';
import { MaintenancePartEntity } from './maintenance-part.entity';

export class MaintenanceEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty({
    nullable: true,
    description:
      'Placa do veiculo. Presente em GET /maintenances, GET /maintenances/:id, POST e PATCH; null nas ' +
      'respostas das acoes de ciclo de vida (diagnose/approve/start/complete/cancel/status), que nao fazem ' +
      'join com Vehicle -- refaça um GET para obter o valor atualizado.',
  })
  vehiclePlate!: string | null;

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

  @ApiProperty({ nullable: true, description: 'Fase 82 -- data em que a execucao da OS de fato comecou.' })
  startedAt!: Date | null;

  @ApiProperty({ nullable: true, description: 'Data em que a manutencao foi concluida.' })
  completedAt!: Date | null;

  @ApiProperty({ nullable: true, description: 'Fase 82 -- texto de diagnostico tecnico (distinto de description/notes).' })
  diagnosis!: string | null;

  @ApiProperty({ nullable: true, description: 'Quilometragem do veiculo no momento do registro (abertura).' })
  odometerKm!: number | null;

  @ApiProperty({ nullable: true, description: 'Fase 82 -- quilometragem do veiculo na conclusao da OS.' })
  completionOdometerKm!: number | null;

  @ApiProperty({ nullable: true, description: 'Texto livre (Fase 13). Ver workshopId/workshopName para vinculo com o catalogo (Fase 84).' })
  workshop!: string | null;

  @ApiProperty({ nullable: true, description: 'Texto livre (Fase 13). Ver supplierId/supplierName para vinculo com o catalogo (Fase 84).' })
  supplier!: string | null;

  @ApiProperty({ nullable: true })
  mechanic!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Fase 84 -- oficina do catalogo (MaintenanceProvider).' })
  workshopId!: string | null;

  @ApiProperty({ nullable: true, description: 'Fase 84 -- nome da oficina vinculada (mesma limitacao de vehiclePlate: null nas acoes de ciclo de vida).' })
  workshopName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Fase 84 -- fornecedor do catalogo (MaintenanceProvider).' })
  supplierId!: string | null;

  @ApiProperty({ nullable: true, description: 'Fase 84 -- nome do fornecedor vinculado (mesma limitacao de vehiclePlate: null nas acoes de ciclo de vida).' })
  supplierName!: string | null;

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

  @ApiProperty({ enum: MaintenanceComponent, nullable: true })
  component!: MaintenanceComponent | null;

  @ApiProperty({ nullable: true, description: 'Quilometragem prevista da proxima manutencao deste componente.' })
  nextOdometerKm!: number | null;

  @ApiProperty({ nullable: true, description: 'Tempo de veiculo parado (minutos), informado explicitamente.' })
  downtimeMinutes!: number | null;

  @ApiProperty({ nullable: true })
  invoiceNumber!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  maintenancePlanId!: string | null;

  @ApiProperty({ type: [MaintenancePartEntity] })
  parts!: MaintenancePartEntity[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
