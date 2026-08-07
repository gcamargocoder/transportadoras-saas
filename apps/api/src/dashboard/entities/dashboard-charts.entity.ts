import { ApiProperty } from '@nestjs/swagger';

// Sempre 12 pontos (ultimos 12 meses), mes sem movimentacao com value = 0
// -- nunca omitido (ver common/utils/monthly-series.util.ts). Ao contrario
// das demais secoes, charts SEMPRE usa a janela fixa de 12 meses,
// ignorando startDate/endDate (mas ainda respeita vehicleId/driverId/
// customerId quando aplicavel -- ver DashboardService.getCharts).
export class DashboardChartPointEntity {
  @ApiProperty({ example: 'Jan' })
  month!: string;

  @ApiProperty()
  value!: number;
}

export class DashboardChartsEntity {
  @ApiProperty({ type: [DashboardChartPointEntity] })
  monthlyRevenue!: DashboardChartPointEntity[];

  @ApiProperty({ type: [DashboardChartPointEntity] })
  monthlyExpenses!: DashboardChartPointEntity[];

  @ApiProperty({ type: [DashboardChartPointEntity] })
  monthlyFuelCost!: DashboardChartPointEntity[];

  @ApiProperty({ type: [DashboardChartPointEntity] })
  monthlyTrips!: DashboardChartPointEntity[];
}
