import { ApiProperty } from '@nestjs/swagger';
import { DashboardChartPointEntity } from '../../dashboard/entities/dashboard-charts.entity';
import { FleetVehicleRankingEntryEntity } from './fleet-vehicle-ranking-entry.entity';

export class FleetCostCategoryEntity {
  @ApiProperty({ example: 'FUEL' })
  category!: string;

  @ApiProperty()
  amount!: number;
}

// Fase 41 -- ranking por Vehicle.fleetId. fleetId=null representa veiculos
// sem frota atribuida (estado real, nunca omitido).
export class FleetCostFleetEntity {
  @ApiProperty({ nullable: true, format: 'uuid' })
  fleetId!: string | null;

  @ApiProperty({ example: 'Frota Própria' })
  fleetName!: string;

  @ApiProperty()
  amount!: number;
}

// Fase 41 -- so preenchido quando o chamador informa startDate E endDate
// (nunca um "periodo anterior" inventado sem um periodo real de referencia).
export class FleetCostsPreviousPeriodEntity {
  @ApiProperty()
  totalCost!: number;

  @ApiProperty()
  deltaAmount!: number;

  @ApiProperty({ nullable: true, description: 'Null quando o custo do periodo anterior era zero (variacao percentual indefinida).' })
  deltaPercent!: number | null;
}

// Fase 40 -- custos REALIZADOS apenas (nunca previsao). fuelCost =
// FuelSupply.totalAmount; maintenanceCost = VehicleMaintenance.totalCost;
// tireCost = Tire.purchasePrice + TireRetread.cost; tollCost =
// TollTransaction.chargedAmount (cobranca real, NUNCA
// RoutePlanToll.estimatedAmount); otherCost = TripExpense.amount
// (categorias FUEL/MAINTENANCE/TIRES excluidas da soma, ja contabilizadas
// pela fonte primaria -- evita dupla contagem).
export class FleetCostsEntity {
  @ApiProperty()
  totalCost!: number;

  @ApiProperty()
  fuelCost!: number;

  @ApiProperty()
  maintenanceCost!: number;

  @ApiProperty()
  tireCost!: number;

  @ApiProperty()
  tollCost!: number;

  @ApiProperty({ description: 'TripExpense.amount de categorias nao cobertas por fuel/manutencao/pneus.' })
  otherCost!: number;

  @ApiProperty({ type: [FleetCostCategoryEntity] })
  costByCategory!: FleetCostCategoryEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value" = custo total (R$) do veiculo.' })
  topVehiclesByCost!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ nullable: true, description: 'totalCost / quantidade de veiculos com pelo menos 1 custo no periodo.' })
  averageCostPerVehicle!: number | null;

  @ApiProperty({ type: [FleetCostFleetEntity], description: 'Fase 41 -- ranking de frotas por custo total.' })
  costByFleet!: FleetCostFleetEntity[];

  @ApiProperty({
    type: [DashboardChartPointEntity],
    description: 'Fase 41 -- evolucao dos ultimos 12 meses (soma de todas as fontes de custo), mesmo padrao do dashboard executivo.',
  })
  monthlyTrend!: DashboardChartPointEntity[];

  @ApiProperty({
    type: FleetCostsPreviousPeriodEntity,
    nullable: true,
    description: 'Fase 41 -- so preenchido quando startDate e endDate sao ambos informados no filtro.',
  })
  previousPeriod!: FleetCostsPreviousPeriodEntity | null;
}
