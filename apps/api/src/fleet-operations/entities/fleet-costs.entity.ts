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

// Fase 85 -- custo/km da frota. distanceKm vem do POOL de leituras reais de
// odometro (FuelSupply.odometerKm + VehicleMaintenance.odometerKm/
// completionOdometerKm) no mesmo escopo de filtro de FleetCostsEntity --
// NUNCA TripMetrics.actualDistanceKm (auditado e confirmado: nenhum service
// em todo o apps/api/src escreve esse campo, ver docs/vehicle-management.md
// e docs/cost-per-km.md). available=false (com reason) quando nenhum
// veiculo do escopo tem >= 2 leituras de odometro -- nunca um custo/km
// inventado sem distancia real.
export class FleetCostPerKmEntity {
  @ApiProperty()
  available!: boolean;

  @ApiProperty({ nullable: true, description: 'Motivo quando available=false (nunca custo/km mascarado com 0 ou null sem explicacao).' })
  reason!: string | null;

  @ApiProperty({ nullable: true, description: 'Distancia real (km) usada no calculo -- pool de odometro de FuelSupply + VehicleMaintenance.' })
  distanceKm!: number | null;

  @ApiProperty({ nullable: true, description: 'totalCost / distanceKm.' })
  value!: number | null;

  @ApiProperty({ nullable: true })
  fuelCostPerKm!: number | null;

  @ApiProperty({ nullable: true })
  maintenanceCostPerKm!: number | null;

  @ApiProperty({ nullable: true })
  tireCostPerKm!: number | null;

  @ApiProperty({ nullable: true })
  tollCostPerKm!: number | null;

  @ApiProperty({ nullable: true, description: 'otherCost (despesas operacionais) / distanceKm.' })
  otherCostPerKm!: number | null;

  @ApiProperty({ nullable: true, description: 'Inicio do periodo considerado (filtro startDate), quando informado.' })
  periodStart!: Date | null;

  @ApiProperty({ nullable: true, description: 'Fim do periodo considerado (filtro endDate), quando informado.' })
  periodEnd!: Date | null;
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

  @ApiProperty({ type: FleetCostPerKmEntity, description: 'Fase 85 -- custo operacional por km da frota.' })
  costPerKm!: FleetCostPerKmEntity;

  @ApiProperty({
    type: [FleetVehicleRankingEntryEntity],
    description:
      'Fase 85 -- "value" = custo/km (R$) do veiculo, "count" = distancia (km) usada no calculo. So inclui ' +
      'veiculos com custo conhecido (fuel/manutencao/pedagio) E distancia qualificada (>= 2 leituras de odometro).',
  })
  topVehiclesByCostPerKm!: FleetVehicleRankingEntryEntity[];
}
