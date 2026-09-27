import { Injectable } from '@nestjs/common';
import { FuelTankMovementType, TripOccurrenceSeverity } from '@prisma/client';
import { compact } from '../../common/utils/compact.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { FleetIdleTimeService, VehicleIdleData } from '../../fleet-operations/services/fleet-idle-time.service';
import { FleetOperationsMetricsService } from '../../fleet-operations/services/fleet-operations-metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EMPTY_SNAPSHOT } from '../kpis/empty-snapshot';
import { BiPeriodSnapshot, FuelTankSnapshot, SNAPSHOT_PARTS, SnapshotPart } from '../kpis/kpi.types';
import {
  BiScope,
  buildCompletedDeliveryWhere,
  buildCompletedTripWhere,
  buildFuelTankInventoryCheckWhere,
  buildFuelTankMovementWhere,
  buildOccurrenceWhere,
  isDeliveredOnTime,
} from '../utils/bi-where.util';
import { computeFleetTimeTotals } from '../utils/fleet-time.util';
import { KpiPeriod, safeRatio } from '../utils/kpi-period.util';
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

    const [costs, revenue, completedTrips, deliveries, occurrences, fuelTank] = await Promise.all([
      needsCosts
        ? this.fleetMetrics.computeCostTotals(tenantId, fleetScope, { includeDistance: wanted.has('distance') })
        : EMPTY_SNAPSHOT.costs,
      wanted.has('revenue') ? this.fleetMetrics.computeRevenueTotals(tenantId, fleetScope) : EMPTY_SNAPSHOT.revenue,
      wanted.has('trips')
        ? this.prisma.trip.count({ where: buildCompletedTripWhere(tenantId, scope, period) })
        : EMPTY_SNAPSHOT.trips.completed,
      wanted.has('deliveries') ? this.collectDeliveries(deliveryWhere) : EMPTY_SNAPSHOT.deliveries,
      wanted.has('occurrences') ? this.collectOccurrences(tenantId, scope, period) : EMPTY_SNAPSHOT.occurrences,
      wanted.has('fuelTank') ? this.collectFuelTank(tenantId, scope, period) : EMPTY_SNAPSHOT.fuelTank,
    ]);

    return {
      period,
      revenue,
      costs,
      trips: { completed: completedTrips },
      deliveries,
      occurrences,
      fleetTime: wanted.has('fleetTime') ? computeFleetTimeTotals(vehicleData, period, now) : EMPTY_SNAPSHOT.fleetTime,
      fuelTank,
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

  // Fase 6 -- ledger do tanque (FuelTankMovement/FuelTankInventoryCheck),
  // fonte SEPARADA de `costs.fuelCost`/`fuelLiters` (FuelSupply, consumo do
  // veiculo). RECEIPT/INTERNAL_FUELING/ADJUSTMENT agregados por
  // aggregate() (mesmo where usado pela listagem de evidencias); o saldo
  // (stockAtEnd) NUNCA vem de um SUM de movimentacoes -- e reconstruido a
  // partir da ultima FuelTankMovement.newBalanceLiters de cada tanque (o
  // ledger ja carrega o saldo corrente calculado, nunca uma segunda soma).
  private async collectFuelTank(tenantId: string, scope: BiScope, period: KpiPeriod): Promise<FuelTankSnapshot> {
    const receiptWhere = buildFuelTankMovementWhere(tenantId, scope, period, FuelTankMovementType.RECEIPT);
    const [receipts, pricedReceipts, internal, adjustments, tanks, checks] = await Promise.all([
      this.prisma.fuelTankMovement.aggregate({
        where: receiptWhere,
        _sum: { quantityLiters: true, totalAmount: true },
        _count: true,
      }),
      this.prisma.fuelTankMovement.aggregate({
        where: { ...receiptWhere, pricePerLiter: { not: null } },
        _sum: { quantityLiters: true, totalAmount: true },
      }),
      this.prisma.fuelTankMovement.aggregate({
        where: buildFuelTankMovementWhere(tenantId, scope, period, FuelTankMovementType.INTERNAL_FUELING),
        _sum: { quantityLiters: true },
        _count: true,
      }),
      this.prisma.fuelTankMovement.aggregate({
        where: buildFuelTankMovementWhere(tenantId, scope, period, FuelTankMovementType.ADJUSTMENT),
        _sum: { quantityLiters: true },
        _count: true,
      }),
      this.prisma.fuelTank.findMany({ where: { tenantId, ...compact({ id: scope.tankId }) }, select: { id: true } }),
      this.prisma.fuelTankInventoryCheck.aggregate({
        where: buildFuelTankInventoryCheckWhere(tenantId, scope, period),
        _sum: { divergenceLiters: true },
        _count: true,
      }),
    ]);

    const stockAtEnd = await this.collectFuelTankStockAtEnd(
      tenantId,
      tanks.map((t) => t.id),
      period.end,
    );

    return {
      stockAtEnd: stockAtEnd.value,
      tanksConsidered: tanks.length,
      receivedLiters: toNumberOrNull(receipts._sum.quantityLiters) ?? 0,
      receiptCount: receipts._count,
      receivedCost: toNumberOrNull(receipts._sum.totalAmount) ?? 0,
      averagePurchasePrice: safeRatio(
        toNumberOrNull(pricedReceipts._sum.totalAmount) ?? 0,
        toNumberOrNull(pricedReceipts._sum.quantityLiters),
      ),
      pricedReceiptLiters: toNumberOrNull(pricedReceipts._sum.quantityLiters) ?? 0,
      internalLiters: toNumberOrNull(internal._sum.quantityLiters) ?? 0,
      internalFuelingCount: internal._count,
      adjustmentLitersNet: toNumberOrNull(adjustments._sum.quantityLiters) ?? 0,
      adjustmentCount: adjustments._count,
      movementsCount: receipts._count + internal._count + adjustments._count,
      reconciliationDivergenceLiters: toNumberOrNull(checks._sum.divergenceLiters) ?? 0,
      reconciliationChecksCount: checks._count,
    };
  }

  // Ponto no tempo: para cada tanque, a ultima movimentacao com
  // effectiveDate <= referencia (findFirst ordenado por data). Tanques sem
  // NENHUMA movimentacao ate a data (criados depois) ficam de fora da soma
  // -- value=null so quando NENHUM tanque do escopo tem saldo apuravel.
  private async collectFuelTankStockAtEnd(
    tenantId: string,
    tankIds: string[],
    asOf: Date,
  ): Promise<{ value: number | null; tanksWithStock: number }> {
    if (tankIds.length === 0) return { value: null, tanksWithStock: 0 };
    const balances = await Promise.all(
      tankIds.map((tankId) =>
        this.prisma.fuelTankMovement.findFirst({
          where: { tenantId, tankId, effectiveDate: { lte: asOf } },
          orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
          select: { newBalanceLiters: true },
        }),
      ),
    );
    const known = balances.filter((b): b is NonNullable<(typeof balances)[number]> => b !== null);
    if (known.length === 0) return { value: null, tanksWithStock: 0 };
    return { value: known.reduce((sum, b) => sum + (toNumberOrNull(b.newBalanceLiters) ?? 0), 0), tanksWithStock: known.length };
  }
}
