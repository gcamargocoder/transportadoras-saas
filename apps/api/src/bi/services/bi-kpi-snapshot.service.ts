import { Injectable } from '@nestjs/common';
import { TripOccurrenceSeverity } from '@prisma/client';
import { compact } from '../../common/utils/compact.util';
import { FleetIdleTimeService, VehicleIdleData } from '../../fleet-operations/services/fleet-idle-time.service';
import { FleetOperationsMetricsService } from '../../fleet-operations/services/fleet-operations-metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EMPTY_SNAPSHOT } from '../kpis/empty-snapshot';
import { BiPeriodSnapshot, SNAPSHOT_PARTS, SnapshotPart } from '../kpis/kpi.types';
import {
  BiScope,
  buildCompletedDeliveryWhere,
  buildCompletedTripWhere,
  buildOccurrenceWhere,
  isDeliveredOnTime,
} from '../utils/bi-where.util';
import { computeFleetTimeTotals } from '../utils/fleet-time.util';
import { KpiPeriod } from '../utils/kpi-period.util';
import { mapWithConcurrency } from '../utils/concurrency.util';

// BI 3 -- periodos coletados em paralelo, no maximo N por vez: a serie
// temporal pede dezenas de baldes e cada um dispara algumas agregacoes;
// sem limite, um unico request esgotaria o pool de conexoes do Prisma.
const PERIOD_CONCURRENCY = 4;

// BI 1 -- coleta os dados BRUTOS de cada periodo. Nao calcula KPI (isso e
// o catalogo, puro) e nao reimplementa nenhuma regra ja existente:
//  - custos/distancia/litros -> FleetOperationsMetricsService.computeCostTotals
//    (mesma funcao que alimenta GET /fleet-operations/costs);
//  - receita -> FleetOperationsMetricsService.computeRevenueTotals
//    (mesmo where de GET /fleet-operations/financial);
//  - tempo de frota -> FleetIdleTimeService.loadVehicleIdleData (mesma carga
//    de GET /fleet-operations/idle-time), carregada UMA vez e recortada por
//    periodo em memoria (a carga independe do periodo).
// BI 3 -- `parts` restringe a coleta ao que os KPIs pedidos leem (partes
// nao pedidas ficam com o valor de EMPTY_SNAPSHOT e nunca sao lidas).
// Toda consulta recebe tenantId do TenantContext (nunca do cliente).
@Injectable()
export class BiKpiSnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fleetMetrics: FleetOperationsMetricsService,
    private readonly idleTime: FleetIdleTimeService,
  ) {}

  async collect(
    tenantId: string,
    scope: BiScope,
    periods: KpiPeriod[],
    now: Date = new Date(),
    parts: readonly SnapshotPart[] = SNAPSHOT_PARTS,
  ): Promise<BiPeriodSnapshot[]> {
    const wanted = new Set(parts);
    const vehicleData = wanted.has('fleetTime') ? await this.idleTime.loadVehicleIdleData(tenantId, scope) : [];
    return mapWithConcurrency(periods, PERIOD_CONCURRENCY, (period) =>
      this.collectPeriod(tenantId, scope, period, vehicleData, now, wanted),
    );
  }

  private async collectPeriod(
    tenantId: string,
    scope: BiScope,
    period: KpiPeriod,
    vehicleData: VehicleIdleData[],
    now: Date,
    wanted: Set<SnapshotPart>,
  ): Promise<BiPeriodSnapshot> {
    // customerId so e lido pelo where de receita (ver FleetMetricsScope).
    const fleetScope = compact({ startDate: period.start, endDate: period.end, ...scope });
    const deliveryWhere = buildCompletedDeliveryWhere(tenantId, scope, period);
    const needsCosts = wanted.has('costs') || wanted.has('distance');

    const [costs, revenue, completedTrips, deliveries, occurrences] = await Promise.all([
      needsCosts
        ? this.fleetMetrics.computeCostTotals(tenantId, fleetScope, { includeDistance: wanted.has('distance') })
        : EMPTY_SNAPSHOT.costs,
      wanted.has('revenue') ? this.fleetMetrics.computeRevenueTotals(tenantId, fleetScope) : EMPTY_SNAPSHOT.revenue,
      wanted.has('trips')
        ? this.prisma.trip.count({ where: buildCompletedTripWhere(tenantId, scope, period) })
        : EMPTY_SNAPSHOT.trips.completed,
      wanted.has('deliveries') ? this.collectDeliveries(deliveryWhere) : EMPTY_SNAPSHOT.deliveries,
      wanted.has('occurrences') ? this.collectOccurrences(tenantId, scope, period) : EMPTY_SNAPSHOT.occurrences,
    ]);

    return {
      period,
      revenue,
      costs,
      trips: { completed: completedTrips },
      deliveries,
      occurrences,
      fleetTime: wanted.has('fleetTime') ? computeFleetTimeTotals(vehicleData, period, now) : EMPTY_SNAPSHOT.fleetTime,
    };
  }

  private async collectDeliveries(
    where: ReturnType<typeof buildCompletedDeliveryWhere>,
  ): Promise<BiPeriodSnapshot['deliveries']> {
    const [completed, deadlineRows] = await Promise.all([
      this.prisma.tripDeliveryStop.count({ where }),
      // Comparar 2 colunas exigiria SQL bruto -- projecao minima (3 datas)
      // so das entregas elegiveis, comparada em memoria.
      this.prisma.tripDeliveryStop.findMany({
        where: { ...where, plannedArrival: { not: null } },
        select: { plannedArrival: true, actualArrival: true, deliveredAt: true },
      }),
    ]);
    const onTime = deadlineRows.filter(
      (row) =>
        row.plannedArrival !== null &&
        isDeliveredOnTime({ plannedArrival: row.plannedArrival, actualArrival: row.actualArrival, deliveredAt: row.deliveredAt }),
    ).length;
    return { completed, withDeadline: deadlineRows.length, onTime };
  }

  private async collectOccurrences(
    tenantId: string,
    scope: BiScope,
    period: KpiPeriod,
  ): Promise<BiPeriodSnapshot['occurrences']> {
    const [total, critical] = await Promise.all([
      this.prisma.tripOccurrence.count({ where: buildOccurrenceWhere(tenantId, scope, period) }),
      this.prisma.tripOccurrence.count({
        where: buildOccurrenceWhere(tenantId, scope, period, TripOccurrenceSeverity.CRITICAL),
      }),
    ]);
    return { total, critical };
  }
}
