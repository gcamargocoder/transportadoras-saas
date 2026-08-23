import { Injectable } from '@nestjs/common';
import { Prisma, TripOccurrenceSeverity } from '@prisma/client';
import { compact } from '../../common/utils/compact.util';
import { aggregateMonthlySeries } from '../../common/utils/monthly-series.util';
import { PrismaService } from '../../prisma/prisma.service';
import { FindFleetOccurrencesQueryDto } from '../dto/find-fleet-occurrences-query.dto';
import {
  FleetOccurrenceDriverRankingEntryEntity,
  FleetOccurrencesDashboardEntity,
} from '../entities/fleet-occurrences-dashboard.entity';
import { FleetVehicleRankingEntryEntity } from '../entities/fleet-vehicle-ranking-entry.entity';
import { mergeVehicleAmounts, rankTopVehicles, VehicleRankingAccumulator } from '../utils/fleet-operations-metrics.util';

const TOP_LIMIT = 10;
const MONTHLY_TREND_MONTHS = 12;

// Fase 68 -- dashboard operacional de TripOccurrence (Fase 67). Servico
// PROPRIO (nao adicionado ao ja enorme FleetOperationsMetricsService) --
// mesmo desenho de TripOccurrencesService/DriverShiftsService na Fase 67:
// so PrismaService, nenhuma dependencia cruzada, injetado diretamente no
// MESMO FleetOperationsController (ver TripsController injetando varios
// services irmaos, mesmo padrao). status (open/resolved/cancelled) e
// SEMPRE derivado de resolvedAt/cancelledAt, nunca uma coluna propria --
// nunca um groupBy(['status']), porque essa coluna nao existe.
@Injectable()
export class FleetOccurrencesMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(tenantId: string, query: FindFleetOccurrencesQueryDto): Promise<FleetOccurrencesDashboardEntity> {
    const where = this.buildWhere(tenantId, query);
    const trendWhere = this.buildWhere(tenantId, query, this.trendDateRange());

    const [
      totalCount,
      openCount,
      criticalOpenCount,
      resolvedCount,
      cancelledCount,
      byTypeRaw,
      bySeverityRaw,
      byVehicleRaw,
      byDriverRaw,
      monthlyTrendRows,
    ] = await Promise.all([
      this.prisma.tripOccurrence.count({ where }),
      this.prisma.tripOccurrence.count({ where: { ...where, resolvedAt: null, cancelledAt: null } }),
      this.prisma.tripOccurrence.count({
        where: { ...where, resolvedAt: null, cancelledAt: null, severity: TripOccurrenceSeverity.CRITICAL },
      }),
      this.prisma.tripOccurrence.count({ where: { ...where, resolvedAt: { not: null }, cancelledAt: null } }),
      this.prisma.tripOccurrence.count({ where: { ...where, cancelledAt: { not: null } } }),
      this.prisma.tripOccurrence.groupBy({ by: ['type'], where, _count: true }),
      this.prisma.tripOccurrence.groupBy({ by: ['severity'], where, _count: true }),
      this.prisma.tripOccurrence.groupBy({ by: ['vehicleId'], where: { ...where, vehicleId: { not: null } }, _count: true }),
      this.prisma.tripOccurrence.groupBy({ by: ['driverId'], where: { ...where, driverId: { not: null } }, _count: true }),
      // Janela FIXA dos ultimos 12 meses (ignora from/to do filtro, mesmo
      // padrao de FleetStopsDashboardEntity.monthlyTrend) -- so occurredAt,
      // nunca a linha inteira.
      this.prisma.tripOccurrence.findMany({ where: trendWhere, select: { occurredAt: true } }),
    ]);

    const vehicleMap = new Map<string, VehicleRankingAccumulator>();
    mergeVehicleAmounts(
      vehicleMap,
      byVehicleRaw as { vehicleId: string | null; _count: number }[],
      (row) => row._count,
    );
    const byVehicle = await this.attachPlates(rankTopVehicles(vehicleMap, TOP_LIMIT, 'count', 'desc'));

    const driverIds = byDriverRaw.map((r) => r.driverId).filter((id): id is string => id !== null);
    const byDriver = await this.buildDriverRanking(driverIds, byDriverRaw);

    const entity = new FleetOccurrencesDashboardEntity();
    entity.totalCount = totalCount;
    entity.openCount = openCount;
    entity.criticalOpenCount = criticalOpenCount;
    entity.resolvedCount = resolvedCount;
    entity.cancelledCount = cancelledCount;
    entity.byType = byTypeRaw.map((row) => ({ type: row.type, count: row._count }));
    entity.bySeverity = bySeverityRaw.map((row) => ({ severity: row.severity, count: row._count }));
    entity.byVehicle = byVehicle;
    entity.byDriver = byDriver;
    entity.monthlyTrend = aggregateMonthlySeries(
      monthlyTrendRows.map((r) => ({ date: r.occurredAt, value: 1 })),
      MONTHLY_TREND_MONTHS,
    );
    return entity;
  }

  private buildWhere(
    tenantId: string,
    query: FindFleetOccurrencesQueryDto,
    dateRangeOverride?: Prisma.DateTimeFilter,
  ): Prisma.TripOccurrenceWhereInput {
    const dateRange =
      dateRangeOverride ??
      (query.from || query.to
        ? compact({
            gte: query.from ? new Date(query.from) : undefined,
            lte: query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined,
          })
        : undefined);

    let statusFilter: Prisma.TripOccurrenceWhereInput = {};
    if (query.status === 'OPEN') statusFilter = { resolvedAt: null, cancelledAt: null };
    else if (query.status === 'RESOLVED') statusFilter = { resolvedAt: { not: null }, cancelledAt: null };
    else if (query.status === 'CANCELLED') statusFilter = { cancelledAt: { not: null } };

    return {
      tenantId,
      ...compact({
        vehicleId: query.vehicleId,
        driverId: query.driverId,
        type: query.type,
        severity: query.severity,
        occurredAt: dateRange && Object.keys(dateRange).length > 0 ? dateRange : undefined,
      }),
      ...statusFilter,
    };
  }

  // Piso fixo dos ultimos MONTHLY_TREND_MONTHS meses -- mesmo padrao de
  // FleetOperationsMetricsService.trendDateRange.
  private trendDateRange(): Prisma.DateTimeFilter {
    const floor = new Date();
    floor.setUTCMonth(floor.getUTCMonth() - (MONTHLY_TREND_MONTHS - 1), 1);
    floor.setUTCHours(0, 0, 0, 0);
    return { gte: floor };
  }

  private async attachPlates(
    ranking: { vehicleId: string; value: number; count: number }[],
  ): Promise<FleetVehicleRankingEntryEntity[]> {
    if (ranking.length === 0) return [];
    const vehicles = await this.prisma.vehicle.findMany({
      where: { id: { in: ranking.map((r) => r.vehicleId) } },
      select: { id: true, plate: true },
    });
    const plateById = new Map(vehicles.map((v) => [v.id, v.plate]));
    return ranking.map((entry) => {
      const entity = new FleetVehicleRankingEntryEntity();
      entity.vehicleId = entry.vehicleId;
      entity.plate = plateById.get(entry.vehicleId) ?? '—';
      entity.value = entry.value;
      entity.count = entry.count;
      return entity;
    });
  }

  private async buildDriverRanking(
    driverIds: string[],
    rows: { driverId: string | null; _count: number }[],
  ): Promise<FleetOccurrenceDriverRankingEntryEntity[]> {
    if (driverIds.length === 0) return [];
    const drivers = await this.prisma.driver.findMany({
      where: { id: { in: driverIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(drivers.map((d) => [d.id, d.name]));

    return rows
      .filter((row): row is { driverId: string; _count: number } => row.driverId !== null)
      .map((row) => ({ driverId: row.driverId, driverName: nameById.get(row.driverId) ?? '—', count: row._count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_LIMIT);
  }
}
