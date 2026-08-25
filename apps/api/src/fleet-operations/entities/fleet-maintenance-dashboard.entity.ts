import { ApiProperty } from '@nestjs/swagger';
import { MaintenanceComponent, VehicleMaintenancePriority, VehicleMaintenanceType } from '@prisma/client';
import { DashboardChartPointEntity } from '../../dashboard/entities/dashboard-charts.entity';
import { FleetAlertEntity } from './fleet-alert.entity';
import { FleetVehicleRankingEntryEntity } from './fleet-vehicle-ranking-entry.entity';

export class FleetMaintenanceTypeBreakdownEntity {
  @ApiProperty({ enum: VehicleMaintenanceType })
  type!: VehicleMaintenanceType;

  @ApiProperty()
  count!: number;

  @ApiProperty()
  cost!: number;
}

export class FleetMaintenancePriorityBreakdownEntity {
  @ApiProperty({ enum: VehicleMaintenancePriority })
  priority!: VehicleMaintenancePriority;

  @ApiProperty()
  count!: number;
}

export class FleetMaintenanceWorkshopBreakdownEntity {
  @ApiProperty({ nullable: true })
  workshop!: string | null;

  @ApiProperty()
  count!: number;

  @ApiProperty()
  cost!: number;
}

// Fase 45 -- breakdown por componente (secao "Evolucoes e breakdowns" do
// pedido). Registros sem component (historico anterior a Fase 45, ou
// corretiva sem granularidade) caem no balde `null` -- estado real, nunca
// omitido nem inventado.
export class FleetMaintenanceComponentBreakdownEntity {
  @ApiProperty({ enum: MaintenanceComponent, nullable: true })
  component!: MaintenanceComponent | null;

  @ApiProperty()
  count!: number;

  @ApiProperty()
  cost!: number;
}

// Fase 45 -- mesmo padrao ja usado em FleetFuelCostPerKmEntity: available/
// reason nunca mascarados com zero.
export class FleetMaintenanceCostPerKmEntity {
  @ApiProperty({ nullable: true })
  value!: number | null;

  @ApiProperty()
  available!: boolean;

  @ApiProperty({ nullable: true })
  reason!: string | null;
}

// Fase 45 -- linha de "proxima manutencao"/"manutencao vencida", derivada
// de MaintenancePlan + ultima VehicleMaintenance COMPLETED vinculada a ele
// + Vehicle.odometerKm atual (ver maintenance-plan-status.util.ts). Nunca
// aparece para um plano sem nenhum servico concluido ainda (sem base real
// de calculo).
export class FleetMaintenancePlanStatusEntity {
  @ApiProperty({ format: 'uuid' })
  planId!: string;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty()
  vehiclePlate!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: MaintenanceComponent })
  component!: MaintenanceComponent;

  @ApiProperty({ nullable: true, description: 'Quilometragem em que a manutencao vence/venceu (quando o plano usa intervalKm).' })
  dueOdometerKm!: number | null;

  @ApiProperty({ nullable: true, description: 'Data em que a manutencao vence/venceu (quando o plano usa intervalDays).' })
  dueDate!: Date | null;

  @ApiProperty({ nullable: true })
  overdueByKm!: number | null;

  @ApiProperty({ nullable: true })
  overdueByDays!: number | null;
}

// Fase 40 -- gap real: dashboard executivo so somava total, sem breakdown
// (Fase 41: + rankings por veiculo + monthlyTrend). Fase 45: modulo
// completo -- preventiva/corretiva/programada/cancelada, custo de pecas/
// mao de obra separado, tempo parado, custo/km, planos preventivos
// (vencidas/proximas), breakdown e rankings por componente, alertas
// especificos de manutencao.
export class FleetMaintenanceDashboardEntity {
  @ApiProperty({ description: 'Exclui CANCELLED (Fase 45 -- correcao: ate a Fase 44 este total incluia cancelada).' })
  totalCount!: number;

  @ApiProperty({ description: 'OPEN + IN_PROGRESS + WAITING_PARTS.' })
  openCount!: number;

  @ApiProperty({ description: 'Fase 63 -- apenas status IN_PROGRESS (subconjunto de openCount).' })
  inProgressCount!: number;

  @ApiProperty({ description: 'Fase 63 -- veiculos distintos com pelo menos uma manutencao IN_PROGRESS agora.' })
  vehiclesInMaintenanceCount!: number;

  @ApiProperty({ description: 'Fase 45 -- apenas status COMPLETED (ate a Fase 44, este campo somava COMPLETED + CANCELLED).' })
  completedCount!: number;

  @ApiProperty({ description: 'Fase 45 -- status CANCELLED. Nunca contado em nenhum outro indicador/ranking/alerta.' })
  cancelledCount!: number;

  @ApiProperty({ description: 'Fase 45 -- registros com scheduledAt preenchido, ainda nao concluidos/cancelados.' })
  scheduledCount!: number;

  @ApiProperty({
    description:
      'Fase 82 -- OS ("Ordens de Servico", ver docs/work-orders.md) com scheduledAt JA vencido, ainda em aberto ' +
      '(subconjunto de scheduledCount). Distinto de overdueCount abaixo (planos preventivos vencidos via MaintenancePlan).',
  })
  lateWorkOrdersCount!: number;

  @ApiProperty({ description: 'Fase 45 -- type = PREVENTIVE.' })
  preventiveCount!: number;

  @ApiProperty({ description: 'Fase 45 -- type = CORRECTIVE.' })
  correctiveCount!: number;

  @ApiProperty()
  totalCost!: number;

  @ApiProperty({ description: 'Fase 45 -- soma de laborCost.' })
  laborCostTotal!: number;

  @ApiProperty({ description: 'Fase 45 -- soma de partsCost.' })
  partsCostTotal!: number;

  @ApiProperty({ nullable: true })
  averageCostPerOccurrence!: number | null;

  @ApiProperty({ nullable: true, description: 'Media de (completedAt - openedAt) em horas, so ocorrencias COMPLETED.' })
  averageDurationHours!: number | null;

  @ApiProperty({ nullable: true, description: 'Fase 45 -- soma de downtimeMinutes (so registros com o campo preenchido).' })
  totalDowntimeMinutes!: number | null;

  @ApiProperty({ nullable: true, description: 'Fase 45 -- media de downtimeMinutes (so registros com o campo preenchido).' })
  averageDowntimeMinutes!: number | null;

  @ApiProperty({ type: FleetMaintenanceCostPerKmEntity })
  costPerKm!: FleetMaintenanceCostPerKmEntity;

  @ApiProperty({ description: 'Fase 45 -- quantidade de planos preventivos vencidos (ver overdueMaintenances).' })
  overdueCount!: number;

  @ApiProperty({ description: 'Fase 45 -- quantidade de planos preventivos proximos do vencimento (ver upcomingMaintenances).' })
  dueSoonCount!: number;

  @ApiProperty({ type: [FleetMaintenanceTypeBreakdownEntity] })
  byType!: FleetMaintenanceTypeBreakdownEntity[];

  @ApiProperty({ type: [FleetMaintenancePriorityBreakdownEntity] })
  byPriority!: FleetMaintenancePriorityBreakdownEntity[];

  @ApiProperty({ type: [FleetMaintenanceWorkshopBreakdownEntity] })
  byWorkshop!: FleetMaintenanceWorkshopBreakdownEntity[];

  @ApiProperty({ type: [FleetMaintenanceComponentBreakdownEntity] })
  byComponent!: FleetMaintenanceComponentBreakdownEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value" = custo total (R$) do veiculo.' })
  topVehiclesByCost!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: 'Fase 45 -- "value" = custo total (R$), ordenado ASC.' })
  bottomVehiclesByCost!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({
    type: [FleetVehicleRankingEntryEntity],
    description: 'Fase 41 -- "value" e "count" = nº de manutencoes do veiculo (mesmo numero nos dois campos).',
  })
  topVehiclesByCount!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: 'Fase 45 -- "value" = downtimeMinutes total do veiculo.' })
  topVehiclesByDowntime!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [FleetMaintenanceComponentBreakdownEntity], description: 'Fase 45 -- top 5 por custo.' })
  topComponentsByCost!: FleetMaintenanceComponentBreakdownEntity[];

  @ApiProperty({ type: [FleetMaintenanceComponentBreakdownEntity], description: 'Fase 45 -- top 5 por ocorrencias.' })
  topComponentsByCount!: FleetMaintenanceComponentBreakdownEntity[];

  @ApiProperty({ type: [FleetMaintenancePlanStatusEntity] })
  overdueMaintenances!: FleetMaintenancePlanStatusEntity[];

  @ApiProperty({ type: [FleetMaintenancePlanStatusEntity] })
  upcomingMaintenances!: FleetMaintenancePlanStatusEntity[];

  @ApiProperty({ type: [FleetAlertEntity], description: 'Fase 45 -- MAINTENANCE_OVERDUE/DUE_SOON/HIGH_COST/EXCESSIVE_BREAKDOWN/EXCESSIVE_DOWNTIME/CRITICAL_COMPONENT.' })
  maintenanceAlerts!: FleetAlertEntity[];

  @ApiProperty({ type: [DashboardChartPointEntity], description: 'Fase 41 -- custo total de manutencao nos ultimos 12 meses.' })
  monthlyTrend!: DashboardChartPointEntity[];
}
