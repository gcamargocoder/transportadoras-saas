import { ApiProperty } from '@nestjs/swagger';
import { MaintenanceComponent, VehicleMaintenanceType } from '@prisma/client';
import {
  MaintenancePlanEvaluationStatus,
  MaintenancePlanOverdueReason,
} from '../../fleet-operations/utils/maintenance-plan-status.util';

// Fase 81 -- resumo da ULTIMA execucao considerada como referencia para o
// calculo do proximo vencimento (a VehicleMaintenance COMPLETED mais
// recente vinculada ao plano). null quando o plano nunca teve execucao.
export class MaintenancePlanLastExecutionEntity {
  @ApiProperty({ nullable: true })
  executedAt!: Date | null;

  @ApiProperty({ nullable: true })
  odometerKm!: number | null;
}

export class MaintenancePlanEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: MaintenanceComponent })
  component!: MaintenanceComponent;

  @ApiProperty({ enum: VehicleMaintenanceType })
  maintenanceType!: VehicleMaintenanceType;

  @ApiProperty({ nullable: true })
  intervalKm!: number | null;

  @ApiProperty({ nullable: true })
  intervalDays!: number | null;

  @ApiProperty({ nullable: true })
  intervalHours!: number | null;

  @ApiProperty({ nullable: true })
  alertBeforeKm!: number | null;

  @ApiProperty({ nullable: true })
  alertBeforeDays!: number | null;

  @ApiProperty()
  active!: boolean;

  @ApiProperty({ nullable: true, description: 'Fase 81 -- observacoes livres do plano.' })
  notes!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  // Fase 108 -- avaliacao ao vivo (nunca persistida) do vencimento deste
  // plano, MESMA funcao pura ja usada pelo dashboard de frota
  // (evaluateMaintenancePlan/FleetOperationsMetricsService.computeMaintenancePlanStatus)
  // e pelo centro de notificacoes (NotificationsService.collectMaintenancePlansDue) --
  // nenhuma segunda regra de vencimento. UNKNOWN quando o plano nunca teve
  // um servico COMPLETED vinculado (sem ponto de partida real para calcular).
  @ApiProperty({ enum: ['OK', 'DUE_SOON', 'OVERDUE', 'UNKNOWN'] })
  status!: MaintenancePlanEvaluationStatus;

  // Fase 81 -- granularidade do vencimento. So preenchido quando
  // status === 'OVERDUE': 'KM' (vencida por KM), 'DATE' (vencida por data),
  // 'BOTH' (vencida pelos dois criterios). null nos demais status.
  @ApiProperty({ enum: ['KM', 'DATE', 'BOTH'], nullable: true })
  overdueReason!: MaintenancePlanOverdueReason;

  @ApiProperty({ nullable: true })
  dueOdometerKm!: number | null;

  @ApiProperty({ nullable: true })
  dueDate!: Date | null;

  @ApiProperty({ nullable: true })
  overdueByKm!: number | null;

  @ApiProperty({ nullable: true })
  overdueByDays!: number | null;

  // Fase 81 -- ultima execucao registrada para este plano (referencia do
  // calculo acima). null quando nunca houve execucao.
  @ApiProperty({ type: MaintenancePlanLastExecutionEntity, nullable: true })
  lastExecution!: MaintenancePlanLastExecutionEntity | null;
}
