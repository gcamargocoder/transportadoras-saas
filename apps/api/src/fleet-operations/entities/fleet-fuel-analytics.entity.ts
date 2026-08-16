import { ApiProperty } from '@nestjs/swagger';
import { DashboardChartPointEntity } from '../../dashboard/entities/dashboard-charts.entity';
import { FleetAlertEntity } from './fleet-alert.entity';
import { FleetVehicleRankingEntryEntity } from './fleet-vehicle-ranking-entry.entity';

// Fase 42 -- gestao avancada de abastecimento. Metodologia de
// consumo/custo-por-km reaproveitada INTEGRALMENTE de
// common/utils/fuel-consumption.util.ts (computeConsumptionTotals), a
// MESMA ja usada por FuelSuppliesService.getDashboard() -- distancia entre
// o primeiro e o ultimo odometro de um veiculo no escopo filtrado, litros
// abastecidos entre eles. So calculado com >= 2 abastecimentos; caso
// contrario `available: false`. Isto e "custo DE COMBUSTIVEL por km" --
// distinto e mais restrito do que o "custo total da frota por km" que a
// Fase 41 documentou como indisponivel (dependeria de
// TripMetrics.actualDistanceKm, cobrindo TODAS as categorias de custo).
export class FleetFuelSummaryEntity {
  @ApiProperty()
  totalCost!: number;

  @ApiProperty()
  totalLiters!: number;

  @ApiProperty()
  supplyCount!: number;

  @ApiProperty({ nullable: true, description: 'totalCost / totalLiters. Null quando totalLiters=0.' })
  averagePricePerLiter!: number | null;

  @ApiProperty({ nullable: true, description: 'totalCost / supplyCount. Null quando supplyCount=0.' })
  averageCostPerSupply!: number | null;

  @ApiProperty({ description: 'Quantidade de veiculos distintos com pelo menos 1 abastecimento no escopo.' })
  vehiclesSupplied!: number;

  @ApiProperty({ description: 'Quantidade de frotas distintas (Vehicle.fleetId) representadas no escopo.' })
  fleetsSupplied!: number;
}

export class FleetFuelConsumptionEntity {
  @ApiProperty({ nullable: true })
  value!: number | null;

  @ApiProperty()
  available!: boolean;

  @ApiProperty({ example: 'km/l' })
  unit!: 'km/l';

  @ApiProperty({
    nullable: true,
    description: 'Motivo quando available=false. Ex: INSUFFICIENT_ODOMETER_READINGS (menos de 2 abastecimentos no escopo).',
  })
  reason!: string | null;
}

export class FleetFuelCostPerKmEntity {
  @ApiProperty({ nullable: true })
  value!: number | null;

  @ApiProperty()
  available!: boolean;

  @ApiProperty({ nullable: true })
  reason!: string | null;
}

export class FleetFuelVehicleBreakdownEntity {
  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty()
  plate!: string;

  @ApiProperty({ nullable: true, format: 'uuid' })
  fleetId!: string | null;

  @ApiProperty()
  fleetName!: string;

  @ApiProperty()
  supplyCount!: number;

  @ApiProperty()
  liters!: number;

  @ApiProperty()
  cost!: number;

  @ApiProperty({ nullable: true })
  averagePricePerLiter!: number | null;

  @ApiProperty({ type: FleetFuelConsumptionEntity })
  consumption!: FleetFuelConsumptionEntity;

  @ApiProperty({ type: FleetFuelCostPerKmEntity })
  costPerKm!: FleetFuelCostPerKmEntity;

  @ApiProperty({ description: 'Posicao no ranking por custo total (1 = maior custo), entre os veiculos do escopo.' })
  rankPosition!: number;

  @ApiProperty({ description: 'true quando detectOdometerRegression encontrou pelo menos 1 par regressivo para este veiculo.' })
  hasOdometerAnomaly!: boolean;
}

export class FleetFuelFleetBreakdownEntity {
  @ApiProperty({ nullable: true, format: 'uuid' })
  fleetId!: string | null;

  @ApiProperty()
  fleetName!: string;

  @ApiProperty()
  supplyCount!: number;

  @ApiProperty()
  liters!: number;

  @ApiProperty()
  cost!: number;

  @ApiProperty({ nullable: true })
  averagePricePerLiter!: number | null;

  @ApiProperty({ type: FleetFuelConsumptionEntity })
  consumption!: FleetFuelConsumptionEntity;
}

// Fase 42, secao E do pedido -- os 8 rankings pedidos. best/worstConsumption
// SO incluem veiculos com consumption.available=true (nunca um veiculo sem
// dado suficiente aparecendo artificialmente como "melhor consumo").
export class FleetFuelRankingsEntity {
  @ApiProperty({ type: [FleetVehicleRankingEntryEntity] })
  topCost!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity] })
  bottomCost!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value" = litros.' })
  topVolume!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value" = litros.' })
  bottomVolume!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value" = km/L. So veiculos com consumo disponivel.' })
  bestConsumption!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value" = km/L. So veiculos com consumo disponivel.' })
  worstConsumption!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value" = preco medio/litro (R$).' })
  topPricePerLiter!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value"="count" = nº de abastecimentos.' })
  topSupplyCount!: FleetVehicleRankingEntryEntity[];
}

// Fase 42, secao H do pedido -- so preenchido quando startDate E endDate
// sao ambos informados (mesma regra da Fase 41 para custos).
export class FleetFuelPreviousPeriodEntity {
  @ApiProperty()
  currentCost!: number;

  @ApiProperty()
  previousCost!: number;

  @ApiProperty({ nullable: true })
  costDeltaPercent!: number | null;

  @ApiProperty()
  currentLiters!: number;

  @ApiProperty()
  previousLiters!: number;

  @ApiProperty({ nullable: true })
  litersDeltaPercent!: number | null;

  @ApiProperty()
  currentSupplyCount!: number;

  @ApiProperty()
  previousSupplyCount!: number;

  @ApiProperty({ nullable: true })
  supplyCountDeltaPercent!: number | null;
}

// Iteracao de redesign visual (dashboard de combustivel) -- nivel de
// tanque ESTIMADO, nunca lido de sensor real (Telemetry.fuelLevel existe no
// schema mas nunca e escrito/lido em lugar nenhum do sistema hoje). A
// estimativa assume que cada abastecimento enche o tanque ate
// Vehicle.tankCapacityLiters, e desconta o consumo estimado desde entao
// (km rodados / Vehicle.averageConsumptionKmL). So calculado quando TODOS
// os dados existem -- ver computeTankLevels() no service para as regras
// completas de disponibilidade/reason.
export class FleetFuelTankLevelEntity {
  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty()
  plate!: string;

  @ApiProperty({ nullable: true, description: 'Vehicle.tankCapacityLiters. Null quando o veiculo nao tem capacidade cadastrada.' })
  capacityLiters!: number | null;

  @ApiProperty({ nullable: true })
  estimatedLevelLiters!: number | null;

  @ApiProperty({ nullable: true, description: '0-100, arredondado.' })
  percentage!: number | null;

  @ApiProperty()
  available!: boolean;

  @ApiProperty({
    nullable: true,
    description:
      'Motivo quando available=false: TANK_CAPACITY_NOT_CONFIGURED | AVERAGE_CONSUMPTION_NOT_CONFIGURED | NO_SUPPLY_RECORDED | VEHICLE_ODOMETER_NOT_AVAILABLE.',
  })
  reason!: string | null;

  @ApiProperty({ nullable: true })
  lastSupplyAt!: string | null;

  @ApiProperty({ nullable: true })
  kmSinceLastSupply!: number | null;
}

export class FleetFuelTankFleetAverageEntity {
  @ApiProperty({ nullable: true })
  value!: number | null;

  @ApiProperty()
  available!: boolean;

  @ApiProperty({ nullable: true })
  reason!: string | null;
}

export class FleetFuelAnalyticsEntity {
  @ApiProperty({ type: FleetFuelSummaryEntity })
  summary!: FleetFuelSummaryEntity;

  @ApiProperty({ type: FleetFuelConsumptionEntity, description: 'Consumo agregado da frota inteira no escopo.' })
  consumption!: FleetFuelConsumptionEntity;

  @ApiProperty({ type: FleetFuelCostPerKmEntity, description: 'Custo de combustivel por km, agregado da frota inteira no escopo.' })
  costPerKm!: FleetFuelCostPerKmEntity;

  @ApiProperty({ type: [DashboardChartPointEntity], description: 'Ultimos 12 meses, sempre (ignora startDate/endDate).' })
  monthlyTrendCost!: DashboardChartPointEntity[];

  @ApiProperty({ type: [DashboardChartPointEntity] })
  monthlyTrendLiters!: DashboardChartPointEntity[];

  @ApiProperty({ type: [DashboardChartPointEntity] })
  monthlyTrendSupplyCount!: DashboardChartPointEntity[];

  @ApiProperty({ type: [FleetFuelVehicleBreakdownEntity] })
  vehicleBreakdown!: FleetFuelVehicleBreakdownEntity[];

  @ApiProperty({ type: [FleetFuelFleetBreakdownEntity] })
  fleetBreakdown!: FleetFuelFleetBreakdownEntity[];

  @ApiProperty({ type: FleetFuelRankingsEntity })
  rankings!: FleetFuelRankingsEntity;

  @ApiProperty({ type: [FleetAlertEntity] })
  alerts!: FleetAlertEntity[];

  @ApiProperty({ type: FleetFuelPreviousPeriodEntity, nullable: true })
  previousPeriod!: FleetFuelPreviousPeriodEntity | null;

  @ApiProperty({
    type: [FleetFuelTankLevelEntity],
    description: 'Estado atual (ignora startDate/endDate). Ordenado por percentage ascendente; indisponiveis por ultimo.',
  })
  tankLevels!: FleetFuelTankLevelEntity[];

  @ApiProperty({ type: FleetFuelTankFleetAverageEntity })
  tankFleetAverage!: FleetFuelTankFleetAverageEntity;
}
