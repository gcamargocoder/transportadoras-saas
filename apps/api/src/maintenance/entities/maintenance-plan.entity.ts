import { ApiProperty } from '@nestjs/swagger';
import { MaintenanceComponent, VehicleMaintenanceType } from '@prisma/client';
import { MaintenancePlanEvaluationStatus } from '../../fleet-operations/utils/maintenance-plan-status.util';

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

  @ApiProperty({ nullable: true })
  dueOdometerKm!: number | null;

  @ApiProperty({ nullable: true })
  dueDate!: Date | null;

  @ApiProperty({ nullable: true })
  overdueByKm!: number | null;

  @ApiProperty({ nullable: true })
  overdueByDays!: number | null;
}
