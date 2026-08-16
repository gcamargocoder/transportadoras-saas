import { ApiProperty } from '@nestjs/swagger';
import { DashboardChartPointEntity } from '../../dashboard/entities/dashboard-charts.entity';
import { FleetAlertEntity } from './fleet-alert.entity';
import { FleetVehicleRankingEntryEntity } from './fleet-vehicle-ranking-entry.entity';

// Dashboard "Tempo parado e receita perdida". Tempo parado vem SOMENTE de
// TripStop (nunca somado com VehicleMaintenance.downtimeMinutes -- as duas
// fontes nao tem nenhum vinculo entre si; somar as duas contaria a mesma
// parada real duas vezes). Receita perdida e uma ESTIMATIVA: tempo parado
// (horas) x taxa de receita/hora do PROPRIO veiculo, calculada a partir do
// historico completo de viagens concluidas dele (nunca R$/km -- Vehicle/
// TripMetrics.actualDistanceKm nunca e escrito por nenhum service).
export type DowntimeCategory = 'MAINTENANCE' | 'BREAKDOWN' | 'FUEL' | 'OTHER';

export const DOWNTIME_CATEGORIES: DowntimeCategory[] = ['MAINTENANCE', 'BREAKDOWN', 'FUEL', 'OTHER'];

export class FleetDowntimeCategoryEntity {
  @ApiProperty({ enum: DOWNTIME_CATEGORIES })
  category!: DowntimeCategory;

  @ApiProperty()
  durationMinutes!: number;

  @ApiProperty()
  count!: number;

  @ApiProperty({ nullable: true, description: 'Soma so entre veiculos com taxa de receita/hora disponivel. Null sem nenhum.' })
  estimatedLostRevenue!: number | null;
}

export class FleetRevenuePerHourEntity {
  @ApiProperty({ nullable: true })
  value!: number | null;

  @ApiProperty()
  available!: boolean;

  @ApiProperty({ nullable: true, description: 'INSUFFICIENT_TRIP_HISTORY | NO_OPERATING_HOURS_RECORDED quando available=false.' })
  reason!: string | null;

  @ApiProperty({ description: 'Quantidade de viagens concluidas usadas no calculo (historico completo, ignora o periodo filtrado).' })
  basedOnTripCount!: number;
}

export class FleetEstimatedLostRevenueEntity {
  @ApiProperty({ nullable: true })
  value!: number | null;

  @ApiProperty()
  available!: boolean;

  @ApiProperty({ nullable: true })
  reason!: string | null;
}

export class FleetVehicleDowntimeCostEntity {
  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty()
  plate!: string;

  @ApiProperty()
  totalDowntimeMinutes!: number;

  @ApiProperty()
  stopCount!: number;

  @ApiProperty({ type: [FleetDowntimeCategoryEntity] })
  byCategory!: FleetDowntimeCategoryEntity[];

  @ApiProperty({ type: FleetRevenuePerHourEntity })
  revenuePerHour!: FleetRevenuePerHourEntity;

  @ApiProperty({ type: FleetEstimatedLostRevenueEntity })
  estimatedLostRevenue!: FleetEstimatedLostRevenueEntity;
}

export class FleetDowntimeCostEntity {
  @ApiProperty()
  totalStops!: number;

  @ApiProperty()
  totalDowntimeMinutes!: number;

  @ApiProperty({
    type: FleetEstimatedLostRevenueEntity,
    description: 'Soma so entre veiculos com taxa disponivel. reason=NO_VEHICLE_WITH_REVENUE_RATE quando nenhum.',
  })
  totalEstimatedLostRevenue!: FleetEstimatedLostRevenueEntity;

  @ApiProperty({ type: [FleetDowntimeCategoryEntity] })
  byCategory!: FleetDowntimeCategoryEntity[];

  @ApiProperty({ type: [FleetVehicleDowntimeCostEntity], description: 'Todos os veiculos do escopo com pelo menos 1 parada.' })
  vehicles!: FleetVehicleDowntimeCostEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value" = receita perdida estimada (R$). So veiculos com taxa disponivel.' })
  topVehiclesByLostRevenue!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value" = minutos parado.' })
  topVehiclesByDowntimeMinutes!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [DashboardChartPointEntity], description: 'Ultimos 12 meses, sempre (ignora startDate/endDate). Minutos parados por mes.' })
  monthlyTrendDowntimeMinutes!: DashboardChartPointEntity[];

  @ApiProperty({ type: [FleetAlertEntity] })
  downtimeCostAlerts!: FleetAlertEntity[];
}
