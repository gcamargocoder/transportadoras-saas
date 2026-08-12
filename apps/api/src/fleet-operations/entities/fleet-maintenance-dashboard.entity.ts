import { ApiProperty } from '@nestjs/swagger';
import { VehicleMaintenancePriority, VehicleMaintenanceType } from '@prisma/client';
import { DashboardChartPointEntity } from '../../dashboard/entities/dashboard-charts.entity';
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

// Fase 40 -- gap real identificado na auditoria: o dashboard executivo so
// soma totalCost + conta aberto/fechado (dashboard/services/dashboard.service.ts:244-283).
// "Componente com maior custo" (pedido original) NAO existe como campo
// estruturado (so texto livre em description/notes) -- documentado como
// indisponivel, nunca inferido por heuristica de texto.
export class FleetMaintenanceDashboardEntity {
  @ApiProperty()
  totalCount!: number;

  @ApiProperty({ description: 'OPEN + IN_PROGRESS + WAITING_PARTS.' })
  openCount!: number;

  @ApiProperty({ description: 'COMPLETED + CANCELLED.' })
  completedCount!: number;

  @ApiProperty()
  totalCost!: number;

  @ApiProperty({ nullable: true })
  averageCostPerOccurrence!: number | null;

  @ApiProperty({ nullable: true, description: 'Media de (completedAt - openedAt) em horas, so ocorrencias COMPLETED.' })
  averageDurationHours!: number | null;

  @ApiProperty({ type: [FleetMaintenanceTypeBreakdownEntity] })
  byType!: FleetMaintenanceTypeBreakdownEntity[];

  @ApiProperty({ type: [FleetMaintenancePriorityBreakdownEntity] })
  byPriority!: FleetMaintenancePriorityBreakdownEntity[];

  @ApiProperty({ type: [FleetMaintenanceWorkshopBreakdownEntity] })
  byWorkshop!: FleetMaintenanceWorkshopBreakdownEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value" = custo total (R$) do veiculo.' })
  topVehiclesByCost!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({
    type: [FleetVehicleRankingEntryEntity],
    description: 'Fase 41 -- "value" e "count" = nº de manutencoes do veiculo (mesmo numero nos dois campos).',
  })
  topVehiclesByCount!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [DashboardChartPointEntity], description: 'Fase 41 -- custo total de manutencao nos ultimos 12 meses.' })
  monthlyTrend!: DashboardChartPointEntity[];
}
