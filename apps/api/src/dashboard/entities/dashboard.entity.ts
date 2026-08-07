import { ApiProperty } from '@nestjs/swagger';
import { DashboardChartsEntity } from './dashboard-charts.entity';
import { DashboardFinancialEntity } from './dashboard-financial.entity';
import { DashboardFleetEntity } from './dashboard-fleet.entity';
import { DashboardOperationalEntity } from './dashboard-operational.entity';
import { DashboardOverviewEntity } from './dashboard-overview.entity';

export class DashboardEntity {
  @ApiProperty({ type: DashboardOverviewEntity })
  overview!: DashboardOverviewEntity;

  @ApiProperty({ type: DashboardFinancialEntity })
  financial!: DashboardFinancialEntity;

  @ApiProperty({ type: DashboardOperationalEntity })
  operational!: DashboardOperationalEntity;

  @ApiProperty({ type: DashboardFleetEntity })
  fleet!: DashboardFleetEntity;

  @ApiProperty({ type: DashboardChartsEntity })
  charts!: DashboardChartsEntity;
}
