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

  @ApiProperty({ type: [FleetStopsTypeBreakdownEntity] })
  byType!: FleetStopsTypeBreakdownEntity[];

  @ApiProperty({ type: [FleetVehicleRankingEntryEntity], description: '"value" = duracao total (minutos) do veiculo.' })
  topVehiclesByDuration!: FleetVehicleRankingEntryEntity[];

  @ApiProperty({ type: [DashboardChartPointEntity], description: 'Fase 41 -- quantidade de paradas nos ultimos 12 meses.' })
  monthlyTrend!: DashboardChartPointEntity[];
}
