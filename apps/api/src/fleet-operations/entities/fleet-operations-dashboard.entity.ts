import { ApiProperty } from '@nestjs/swagger';
import { FuelDashboardEntity } from '../../fuel-supplies/entities/fuel-dashboard.entity';
import { TireDashboardEntity } from '../../tires/entities/tire-dashboard.entity';
import { FleetAlertEntity } from './fleet-alert.entity';
import { FleetChecklistSummaryEntity } from './fleet-checklist-summary.entity';
import { FleetCostsEntity } from './fleet-costs.entity';
import { FleetMaintenanceDashboardEntity } from './fleet-maintenance-dashboard.entity';
import { FleetOperationalIndicatorsEntity } from './fleet-operational-indicators.entity';
import { FleetOverviewEntity } from './fleet-overview.entity';
import { FleetStopsDashboardEntity } from './fleet-stops-dashboard.entity';

// Camada A do pedido da Fase 40 (dashboard consolidado). `fuel`/`tires`
// reaproveitam INTEGRALMENTE FuelSuppliesService.getDashboard()/
// TiresService.getDashboard() ja existentes -- nunca recalculados aqui
// (mesmo principio ja usado por DashboardService.getFleet).
export class FleetOperationsDashboardEntity {
  @ApiProperty({ type: FleetOverviewEntity })
  overview!: FleetOverviewEntity;

  @ApiProperty({ type: FleetCostsEntity })
  costs!: FleetCostsEntity;

  @ApiProperty({ type: FuelDashboardEntity })
  fuel!: FuelDashboardEntity;

  @ApiProperty({ type: TireDashboardEntity })
  tires!: TireDashboardEntity;

  @ApiProperty({ type: FleetMaintenanceDashboardEntity })
  maintenance!: FleetMaintenanceDashboardEntity;

  @ApiProperty({ type: FleetStopsDashboardEntity })
  stops!: FleetStopsDashboardEntity;

  @ApiProperty({ type: FleetChecklistSummaryEntity })
  checklist!: FleetChecklistSummaryEntity;

  @ApiProperty({ type: FleetOperationalIndicatorsEntity })
  operational!: FleetOperationalIndicatorsEntity;

  @ApiProperty({ type: [FleetAlertEntity] })
  alerts!: FleetAlertEntity[];
}
