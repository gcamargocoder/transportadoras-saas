import { ApiProperty } from '@nestjs/swagger';
import { TireStatus } from '@prisma/client';
import { DashboardChartPointEntity } from '../../dashboard/entities/dashboard-charts.entity';
import { FleetAlertEntity } from './fleet-alert.entity';
import { FleetVehicleRankingEntryEntity } from './fleet-vehicle-ranking-entry.entity';

// Dashboard novo (iteracao de redesign visual). Distinto de
// TireDashboardEntity (GET /tires/dashboard, reaproveitado tal como esta
// no card "Pneus" do executivo) -- aqui entram filtros
// (vehicleId/fleetId/tireStatus/periodo), breakdown por frota, evolucao
// mensal, gauge de desgaste por pneu e ranking por veiculo.
export class FleetTireStatusBreakdownEntity {
  @ApiProperty({ enum: TireStatus })
  status!: TireStatus;

  @ApiProperty()
  count!: number;
}

// So pneus ATUALMENTE montados em veiculo (tire.vehicleId setado) --
// pneus em estoque/carreta ja estao cobertos por summary.stockCount, nunca
// atribuidos a uma frota que nao tem relacao direta com eles.
// Fase 64 -- so pneus com Tire.position preenchida (VEHICLE/TRAILER com
// posicao informada); texto livre, nunca uma taxonomia de eixo/lado
// inventada (ver docs/tire-management.md).
export class FleetTirePositionBreakdownEntity {
  @ApiProperty()
  position!: string;

  @ApiProperty()
  count!: number;
}

export class FleetTireFleetBreakdownEntity {
  @ApiProperty({ nullable: true, format: 'uuid' })
  fleetId!: string | null;

  @ApiProperty({ description: '"Sem frota" quando fleetId=null.' })
  fleetName!: string;

  @ApiProperty()
  count!: number;

  @ApiProperty({ description: 'Soma de Tire.purchasePrice dos pneus deste grupo.' })
  cost!: number;
}

// wearPercentRemaining = leitura DIRETA de inspecao (currentTreadDepthMm /
// initialTreadDepthMm), nunca estimado -- distinto do nivel de tanque
// (Fase de combustivel), que precisou de uma premissa de calculo.
export class FleetTireWearEntity {
  @ApiProperty({ format: 'uuid' })
  tireId!: string;

  @ApiProperty()
  fireNumber!: string;

  @ApiProperty({ nullable: true })
  vehiclePlate!: string | null;

  @ApiProperty({ nullable: true, description: 'Tire.position -- texto livre, nunca uma taxonomia inventada.' })
  position!: string | null;

  @ApiProperty({ nullable: true, description: '0-100, arredondado.' })
  wearPercentRemaining!: number | null;

  @ApiProperty({ nullable: true })
  currentTreadDepthMm!: number | null;

  @ApiProperty({ nullable: true })
  initialTreadDepthMm!: number | null;

  @ApiProperty()
  available!: boolean;

  @ApiProperty({
    nullable: true,
    description: 'Motivo quando available=false: INITIAL_TREAD_DEPTH_NOT_CONFIGURED | NO_INSPECTION_RECORDED.',
  })
  reason!: string | null;
}

export class FleetTiresOverviewEntity {
  @ApiProperty()
  totalTires!: number;

  @ApiProperty()
  newCount!: number;

  @ApiProperty()
  inUseCount!: number;

  @ApiProperty()
  stockCount!: number;

  @ApiProperty()
  retreadedCount!: number;

  @ApiProperty()
  scrappedCount!: number;

  @ApiProperty({ description: 'Soma de Tire.purchasePrice no escopo/periodo filtrado.' })
  investedValue!: number;

  @ApiProperty({ description: 'Soma de TireRetread.cost no escopo/periodo filtrado.' })
  retreadValue!: number;

  @ApiProperty({ nullable: true, description: 'Media de Tire.expectedLifespanKm, so entre pneus com o campo preenchido. Null sem nenhum.' })
  averageLifespanKm!: number | null;

  @ApiProperty({
    description:
      'Pneus IN_USE com currentTreadDepthMm <= NEAR_REPLACEMENT_THRESHOLD_MM OU (Fase 110) km rodados desde ' +
      'a instalacao >= NEAR_REPLACEMENT_LIFESPAN_USED_PERCENT de Tire.expectedLifespanKm (quando cadastrado). ' +
      'Mesmo pneu conta uma unica vez mesmo se atender aos 2 criterios.',
  })
  nearReplacementCount!: number;

  @ApiProperty({
    nullable: true,
    description: 'Fase 64 -- (investedValue + retreadValue) / totalTires. Null quando totalTires = 0 (nunca dividir por zero).',
  })
  averageCostPerTire!: number | null;

  @ApiProperty({ type: [FleetTireStatusBreakdownEntity] })
  byStatus!: FleetTireStatusBreakdownEntity[];

  @ApiProperty({
    type: [FleetTirePositionBreakdownEntity],
    description: 'Fase 64 -- so pneus atualmente montados com posicao informada (Tire.position, texto livre).',
  })
  byPosition!: FleetTirePositionBreakdownEntity[];

  @ApiProperty({ type: [FleetTireFleetBreakdownEntity] })
  byFleet!: FleetTireFleetBreakdownEntity[];

  @ApiProperty({ type: [DashboardChartPointEntity], description: 'Ultimos 12 meses, sempre (ignora startDate/endDate). Compra + recapagem.' })
  monthlyTrendCost!: DashboardChartPointEntity[];

  @ApiProperty({
    type: [FleetTireWearEntity],
    description: 'So pneus IN_USE. Ordenado por wearPercentRemaining ascendente (mais gasto primeiro); indisponiveis por ultimo.',
  })
  tireWear!: FleetTireWearEntity[];

  @ApiProperty({
    type: [FleetVehicleRankingEntryEntity],
    description:
      'Soma de Tire.purchasePrice dos pneus atualmente montados no veiculo. NAO inclui custo de recapagem -- ' +
      'TireRetread nao tem vehicleId direto; atribuir pela localizacao ATUAL do pneu seria uma aproximacao, mesma ' +
      'limitacao ja documentada para o ranking de custos gerais (GET /fleet-operations/costs).',
  })
  topVehiclesByTireCost!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [FleetAlertEntity] })
  tireAlerts!: FleetAlertEntity[];
}
