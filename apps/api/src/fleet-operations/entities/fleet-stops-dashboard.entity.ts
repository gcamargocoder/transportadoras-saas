import { ApiProperty } from '@nestjs/swagger';
import { TripStopType } from '@prisma/client';
import { DashboardChartPointEntity } from '../../dashboard/entities/dashboard-charts.entity';
import { FleetVehicleRankingEntryEntity } from './fleet-vehicle-ranking-entry.entity';

export class FleetStopsTypeBreakdownEntity {
  @ApiProperty({ enum: TripStopType })
  type!: TripStopType;

  @ApiProperty()
  count!: number;

  @ApiProperty()
  totalDurationMinutes!: number;
}

// Fase 44 -- ranking de paradas por motorista (secao 2 do pedido). Ordenado
// por totalDurationMinutes desc (empate: stopsCount desc, depois
// averageDurationMinutes desc, depois driverName asc -- ver
// buildDriverStopRanking).
export class FleetStopsDriverRankingEntryEntity {
  @ApiProperty({ format: 'uuid' })
  driverId!: string;

  @ApiProperty()
  driverName!: string;

  @ApiProperty()
  stopsCount!: number;

  @ApiProperty()
  totalDurationMinutes!: number;

  @ApiProperty({ nullable: true })
  averageDurationMinutes!: number | null;

  @ApiProperty({ nullable: true })
  maxDurationMinutes!: number | null;

  @ApiProperty({ nullable: true })
  minDurationMinutes!: number | null;

  @ApiProperty()
  rankPosition!: number;
}

// Fase 44 -- alerta de duracao longa (secao 4/6 do pedido): uma parada
// CONCLUIDA cuja duracao excede o limite configurado (por tenant) para o
// seu tipo. Nunca gerado para parada cancelada ou ainda aberta (ver
// TripStopsService/docs -- OPEN so tem o alerta generico STALLED_VEHICLE ja
// existente, que nao e por tipo).
export class FleetStopDurationAlertEntity {
  @ApiProperty({ format: 'uuid' })
  stopId!: string;

  @ApiProperty({ enum: TripStopType })
  type!: TripStopType;

  @ApiProperty()
  durationMinutes!: number;

  @ApiProperty({ description: 'Limite configurado (padrao ou tenant) para este tipo, em minutos.' })
  thresholdMinutes!: number;

  @ApiProperty({ description: 'durationMinutes - thresholdMinutes.' })
  excessMinutes!: number;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty()
  vehiclePlate!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  driverId!: string | null;

  @ApiProperty({ nullable: true })
  driverName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  tripId!: string | null;

  @ApiProperty({ nullable: true })
  tripReference!: string | null;

  @ApiProperty()
  startedAt!: Date;

  @ApiProperty()
  endedAt!: Date;

  @ApiProperty({ description: 'Sempre COMPLETED (alertas de duracao longa nunca cobrem parada aberta/cancelada).' })
  status!: string;
}

// Fase 40 -- gap real: TripStopsService.findAll so filtra por tripId (sem
// listagem/agregacao cross-frota). "Carga"/"descarga" (pedidos no escopo
// original) NAO existem como categoria propria de TripStopType (so
// UNKNOWN/FUEL/REST/MEAL/MAINTENANCE/OTHER) -- nunca inventadas; ficam
// implicitamente dentro de OTHER/UNKNOWN, documentado em
// docs/fleet-operations-dashboard.md.
export class FleetStopsDashboardEntity {
  @ApiProperty()
  totalStops!: number;

  @ApiProperty()
  totalDurationMinutes!: number;

  @ApiProperty({ nullable: true })
  averageDurationMinutes!: number | null;

  @ApiProperty({ nullable: true, description: 'Maior parada concluida do escopo. Null quando nao ha nenhuma parada concluida.' })
  maxDurationMinutes!: number | null;

  @ApiProperty({ nullable: true, description: 'Menor parada concluida do escopo. Null quando nao ha nenhuma parada concluida.' })
  minDurationMinutes!: number | null;

  @ApiProperty({ type: [FleetStopsTypeBreakdownEntity] })
  byType!: FleetStopsTypeBreakdownEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value" = duracao total (minutos) do veiculo.' })
  topVehiclesByDuration!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [FleetStopsDriverRankingEntryEntity], description: 'Fase 44 -- ranking completo (sem corte de top N) por motorista.' })
  driverRanking!: FleetStopsDriverRankingEntryEntity[];

  @ApiProperty({
    type: [FleetStopDurationAlertEntity],
    description: 'Fase 44 -- paradas concluidas cuja duracao excedeu o limite configurado para o tipo, ordenadas por excesso desc.',
  })
  durationAlerts!: FleetStopDurationAlertEntity[];

  @ApiProperty({ type: [DashboardChartPointEntity], description: 'Fase 41 -- quantidade de paradas nos ultimos 12 meses.' })
  monthlyTrend!: DashboardChartPointEntity[];
}
