import { Injectable } from '@nestjs/common';
import { TripOccurrenceSeverity } from '@prisma/client';
import { compact } from '../../common/utils/compact.util';
import { FleetIdleTimeService, VehicleIdleData } from '../../fleet-operations/services/fleet-idle-time.service';
import { FleetOperationsMetricsService } from '../../fleet-operations/services/fleet-operations-metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BiPeriodSnapshot } from '../kpis/kpi.types';
import {
  BiScope,
  buildCompletedDeliveryWhere,
  buildCompletedTripWhere,
  buildOccurrenceWhere,
  isDeliveredOnTime,
} from '../utils/bi-where.util';
import { computeFleetTimeTotals } from '../utils/fleet-time.util';
import { KpiPeriod } from '../utils/kpi-period.util';

// BI 1 -- coleta os dados BRUTOS de cada periodo. Nao calcula KPI (isso e
// o catalogo, puro) e nao reimplementa nenhuma regra ja existente:
//  - custos/distancia/litros -> FleetOperationsMetricsService.computeCostTotals
//    (mesma funcao que alimenta GET /fleet-operations/costs);
//  - receita -> FleetOperationsMetricsService.computeRevenueTotals
//    (mesmo where de GET /fleet-operations/financial);
//  - tempo de frota -> FleetIdleTimeService.loadVehicleIdleData (mesma carga
//    de GET /fleet-operations/idle-time), carregada UMA vez e recortada por
//    periodo em memoria (a carga independe do periodo).
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
  ): Promise<BiPeriodSnapshot[]> {
    const vehicleData = await this.idleTime.loadVehicleIdleData(tenantId, scope);
    return Promise.all(periods.map((period) => this.collectPeriod(tenantId, scope, period, vehicleData, now)));
  }

  private async collectPeriod(
    tenantId: string,
    scope: BiScope,
    period: KpiPeriod,
    vehicleData: VehicleIdleData[],
    now: Date,
  ): Promise<BiPeriodSnapshot> {
    const fleetScope = compact({ startDate: period.start, endDate: period.end, ...scope });
    const deliveryWhere = buildCompletedDeliveryWhere(tenantId, scope, period);

    const [costs, revenue, completedTrips, completedDeliveries, deadlineRows, occurrences, criticalOccurrences] =
      await Promise.all([
        this.fleetMetrics.computeCostTotals(tenantId, fleetScope),
        this.fleetMetrics.computeRevenueTotals(tenantId, fleetScope),
        this.prisma.trip.count({ where: buildCompletedTripWhere(tenantId, scope, period) }),
        this.prisma.tripDeliveryStop.count({ where: deliveryWhere }),
        // Comparar 2 colunas exigiria SQL bruto -- projecao minima (3 datas)
        // so das entregas elegiveis, comparada em memoria.
        this.prisma.tripDeliveryStop.findMany({
          where: { ...deliveryWhere, plannedArrival: { not: null } },
          select: { plannedArrival: true, actualArrival: true, deliveredAt: true },
        }),
        this.prisma.tripOccurrence.count({ where: buildOccurrenceWhere(tenantId, scope, period) }),
        this.prisma.tripOccurrence.count({
          where: buildOccurrenceWhere(tenantId, scope, period, TripOccurrenceSeverity.CRITICAL),
        }),
      ]);

    const onTime = deadlineRows.filter(
      (row) =>
        row.plannedArrival !== null &&
        isDeliveredOnTime({ plannedArrival: row.plannedArrival, actualArrival: row.actualArrival, deliveredAt: row.deliveredAt }),
    ).length;

    return {
      period,
      revenue,
      costs,
      trips: { completed: completedTrips },
      deliveries: { completed: completedDeliveries, withDeadline: deadlineRows.length, onTime },
      occurrences: { total: occurrences, critical: criticalOccurrences },
      fleetTime: computeFleetTimeTotals(vehicleData, period, now),
    };
  }
}
