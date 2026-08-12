import { Injectable } from '@nestjs/common';
import {
  ChecklistExecutionStatus,
  ExpenseCategory,
  ExpenseStatus,
  Prisma,
  TripStatus,
  TripStopType,
  VehicleMaintenancePriority,
  VehicleMaintenanceStatus,
  VehicleMaintenanceType,
  VehicleStatus,
} from '@prisma/client';
import { compact } from '../../common/utils/compact.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import {
  computeConsumptionTotals,
  detectOdometerRegression,
  FuelConsumptionTotals,
} from '../../common/utils/fuel-consumption.util';
import { aggregateMonthlySeries } from '../../common/utils/monthly-series.util';
import { DashboardChartPointEntity } from '../../dashboard/entities/dashboard-charts.entity';
import { FindFuelSuppliesQueryDto } from '../../fuel-supplies/dto/find-fuel-supplies-query.dto';
import { FuelSuppliesService } from '../../fuel-supplies/services/fuel-supplies.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TiresService } from '../../tires/services/tires.service';
import {
  CONSUMPTION_OUTLIER_MULTIPLIER,
  COST_OUTLIER_MULTIPLIER,
  MAINTENANCE_COUNT_OUTLIER_MULTIPLIER,
  MIN_SUPPLIES_FOR_CONSUMPTION,
  PRICE_PER_LITER_OUTLIER_MULTIPLIER,
  STALLED_STOP_MINUTES,
  STOP_TIME_OUTLIER_MULTIPLIER,
  SUPPLY_VOLUME_OUTLIER_MULTIPLIER,
} from '../constants/fleet-operations-alerts.constants';
import { FleetOperationsQueryDto } from '../dto/fleet-operations-query.dto';
import { FleetAlertEntity, FleetAlertSeverity, FleetAlertType } from '../entities/fleet-alert.entity';
import { FleetChecklistSummaryEntity } from '../entities/fleet-checklist-summary.entity';
import { FleetCostCategoryEntity, FleetCostFleetEntity, FleetCostsEntity, FleetCostsPreviousPeriodEntity } from '../entities/fleet-costs.entity';
import {
  FleetFuelAnalyticsEntity,
  FleetFuelCostPerKmEntity,
  FleetFuelConsumptionEntity,
  FleetFuelFleetBreakdownEntity,
  FleetFuelPreviousPeriodEntity,
  FleetFuelRankingsEntity,
  FleetFuelSummaryEntity,
  FleetFuelVehicleBreakdownEntity,
} from '../entities/fleet-fuel-analytics.entity';
import { FleetMaintenanceDashboardEntity } from '../entities/fleet-maintenance-dashboard.entity';
import { FleetOperationalIndicatorsEntity } from '../entities/fleet-operational-indicators.entity';
import { FleetOperationsDashboardEntity } from '../entities/fleet-operations-dashboard.entity';
import { FleetOverviewEntity } from '../entities/fleet-overview.entity';
import { FleetStopsDashboardEntity } from '../entities/fleet-stops-dashboard.entity';
import { FleetVehicleRankingEntryEntity } from '../entities/fleet-vehicle-ranking-entry.entity';
import {
  computeAverageDurationHours,
  computeDeltaPercent,
  computePreviousPeriodRange,
  FuelVehicleAggregate,
  isLowOutlier,
  isOutlier,
  mergeByFleet,
  mergeFuelByFleet,
  mergeVehicleAmounts,
  rankTopVehicles,
  safeAverage,
  VehicleRankingAccumulator,
  VehicleRankingEntry,
} from '../utils/fleet-operations-metrics.util';

const ACTIVE_TRIP_STATUSES: TripStatus[] = [TripStatus.IN_PROGRESS, TripStatus.PAUSED];

// Mesma divisao binaria ja usada em DashboardService (Fase 19) --
// OPEN/IN_PROGRESS/WAITING_PARTS = em aberto, COMPLETED/CANCELLED = encerrada.
const OPEN_MAINTENANCE_STATUSES: VehicleMaintenanceStatus[] = [
  VehicleMaintenanceStatus.OPEN,
  VehicleMaintenanceStatus.IN_PROGRESS,
  VehicleMaintenanceStatus.WAITING_PARTS,
];
const CLOSED_MAINTENANCE_STATUSES: VehicleMaintenanceStatus[] = [
  VehicleMaintenanceStatus.COMPLETED,
  VehicleMaintenanceStatus.CANCELLED,
];

// Categorias de TripExpense com fonte primaria propria neste dashboard --
// excluidas da soma de "otherCost" para nunca contar o mesmo custo duas
// vezes (Fase 40, secao 27 do pedido: nunca somar previsto+realizado nem
// duplicar fonte).
const EXPENSE_CATEGORIES_WITH_PRIMARY_SOURCE: ExpenseCategory[] = [
  ExpenseCategory.FUEL,
  ExpenseCategory.MAINTENANCE,
  ExpenseCategory.TIRES,
];

const TOP_VEHICLES_LIMIT = 5;
const TOP_FLEETS_LIMIT = 5;
const MONTHLY_TREND_MONTHS = 12;
const ALERTS_LIMIT_PER_TYPE = 10;

const PENDING_CHECKLIST_STATUSES: ChecklistExecutionStatus[] = [
  ChecklistExecutionStatus.DRAFT,
  ChecklistExecutionStatus.IN_PROGRESS,
];

interface FleetOperationsFilters {
  startDate?: Date;
  endDate?: Date;
  vehicleId?: string;
  fleetId?: string;
}

interface CostsResult {
  entity: FleetCostsEntity;
  vehicleMap: Map<string, VehicleRankingAccumulator>;
}

interface MaintenanceResult {
  entity: FleetMaintenanceDashboardEntity;
  vehicleMap: Map<string, VehicleRankingAccumulator>;
}

interface StopsResult {
  entity: FleetStopsDashboardEntity;
  vehicleMap: Map<string, VehicleRankingAccumulator>;
}

// Fase 40/41 -- camada de metricas agregadas da frota. Mesmo padrao ja
// estabelecido por DashboardService (Fase 19): agregacao de LEITURA via
// Prisma direto (aggregate/groupBy/count), nunca via loop por registro,
// nunca reimplementa a logica de escrita dos dominios (essa continua
// exclusiva de VehiclesService/MaintenancesService/TripStopsService/
// ChecklistExecutionsService). fuel/tires sao reaproveitados INTEGRALMENTE
// via FuelSuppliesService/TiresService.getDashboard() ja existentes.
//
// Fase 41 evolui esta camada para nivel executivo (KPIs, rankings,
// evolucao mensal, comparacao com periodo anterior, alertas computados)
// sem quebrar nenhum campo do contrato da Fase 40 -- toda adicao e um
// campo NOVO nas entities existentes. "Km rodados"/"custo por km" NAO
// foram adicionados: auditoria confirmou que TripMetrics.actualDistanceKm
// nunca e escrito por nenhum service (so os campos planned* sao
// atualizados, ver TripMetricsService) -- documentado como indisponivel em
// docs/fleet-operations-dashboard.md, nunca mascarado como 0.
@Injectable()
export class FleetOperationsMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fuelSuppliesService: FuelSuppliesService,
    private readonly tiresService: TiresService,
  ) {}

  async getConsolidatedDashboard(
    tenantId: string,
    query: FleetOperationsQueryDto,
  ): Promise<FleetOperationsDashboardEntity> {
    const filters = this.parseFilters(query);
    const fuelQuery = this.toFuelQuery(filters);

    const [overview, costsResult, fuel, tires, maintenanceResult, stopsResult, checklist] = await Promise.all([
      this.computeOverview(tenantId, filters),
      this.computeCosts(tenantId, filters),
      this.fuelSuppliesService.getDashboard(tenantId, fuelQuery),
      this.tiresService.getDashboard(tenantId),
      this.computeMaintenanceDashboard(tenantId, filters),
      this.computeStopsDashboard(tenantId, filters),
      this.getChecklistSummary(tenantId, filters),
    ]);

    const [operational, alerts] = await Promise.all([
      this.computeOperationalIndicators(tenantId, filters, costsResult.entity.totalCost),
      this.computeAlerts(tenantId, filters, costsResult.vehicleMap, maintenanceResult.vehicleMap, stopsResult.vehicleMap),
    ]);

    const entity = new FleetOperationsDashboardEntity();
    entity.overview = overview;
    entity.costs = costsResult.entity;
    entity.fuel = fuel;
    entity.tires = tires;
    entity.maintenance = maintenanceResult.entity;
    entity.stops = stopsResult.entity;
    entity.checklist = checklist;
    entity.operational = operational;
    entity.alerts = alerts;
    return entity;
  }

  // ==========================================================================
  // OVERVIEW -- "cards principais" (secao 4 do pedido). Todas as contagens
  // em paralelo, sem loop por veiculo/viagem. So consumido pelo dashboard
  // consolidado (sem endpoint proprio, ver plano).
  // ==========================================================================
  private async computeOverview(tenantId: string, filters: FleetOperationsFilters): Promise<FleetOverviewEntity> {
    const vehicleWhere = this.buildVehicleWhere(tenantId, filters);

    const [statusCounts, vehiclesOnTrip, activeTrips, activeDrivers, openAlerts] = await Promise.all([
      this.prisma.vehicle.groupBy({ by: ['status'], where: vehicleWhere, _count: true }),
      // Fase 41 -- contagem relacional (sem N+1): veiculos ACTIVE com pelo
      // menos 1 composicao vinculada a uma viagem em andamento agora.
      this.prisma.vehicle.count({
        where: {
          ...vehicleWhere,
          status: VehicleStatus.ACTIVE,
          tripCompositions: { some: { trip: { status: { in: ACTIVE_TRIP_STATUSES } } } },
        },
      }),
      this.prisma.trip.count({
        where: { ...this.buildTripWhere(tenantId, filters, undefined), status: { in: ACTIVE_TRIP_STATUSES } },
      }),
      this.prisma.driver.count({ where: { tenantId, deletedAt: null, isActive: true } }),
      this.prisma.alert.count({ where: { tenantId, acknowledgedAt: null } }),
    ]);

    const countByStatus = new Map(statusCounts.map((row) => [row.status, row._count]));
    const activeVehicles = countByStatus.get(VehicleStatus.ACTIVE) ?? 0;

    const entity = new FleetOverviewEntity();
    entity.totalVehicles = statusCounts.reduce((sum, row) => sum + row._count, 0);
    entity.activeVehicles = activeVehicles;
    entity.inactiveVehicles = countByStatus.get(VehicleStatus.INACTIVE) ?? 0;
    entity.maintenanceVehicles = countByStatus.get(VehicleStatus.MAINTENANCE) ?? 0;
    entity.soldVehicles = countByStatus.get(VehicleStatus.SOLD) ?? 0;
    entity.activeTrips = activeTrips;
    entity.vehiclesOnTrip = vehiclesOnTrip;
    entity.vehiclesAvailable = Math.max(activeVehicles - vehiclesOnTrip, 0);
    entity.activeDrivers = activeDrivers;
    entity.openAlerts = openAlerts;
    return entity;
  }

  // ==========================================================================
  // COSTS -- so REALIZADO (secao 9/27 do pedido). tireCost inclui compra +
  // recapagem; ranking por veiculo cobre fuel/manutencao/pedagio (as 3
  // fontes com vehicleId direto -- TireRetread exigiria join por tireId,
  // atribuicao aproximada por localizacao ATUAL do pneu, documentado como
  // fora do ranking nesta fase). Endpoint proprio (GET /fleet-operations/costs).
  //
  // Fase 41: + costByFleet (ranking por Vehicle.fleetId), + monthlyTrend
  // (ultimos 12 meses, sempre, mesmo padrao de DashboardService.getCharts
  // -- ignora startDate/endDate, respeita vehicleId/fleetId), + previousPeriod
  // (so quando startDate E endDate sao informados).
  // ==========================================================================
  async getCosts(tenantId: string, query: FleetOperationsQueryDto): Promise<FleetCostsEntity> {
    return (await this.computeCosts(tenantId, this.parseFilters(query))).entity;
  }

  private async computeCosts(tenantId: string, filters: FleetOperationsFilters): Promise<CostsResult> {
    const dateRange = this.dateRangeFilter(filters);

    const fuelWhere = this.buildFuelWhere(tenantId, filters, dateRange);
    const maintenanceWhere = this.buildMaintenanceWhere(tenantId, filters, dateRange);
    const tireWhere = this.buildTireWhere(tenantId, filters, dateRange);
    const retreadWhere = this.buildTireRetreadWhere(tenantId, filters, dateRange);
    const tollWhere = this.buildTollWhere(tenantId, filters, dateRange);
    const expenseWhere = this.buildOtherExpenseWhere(tenantId, filters, dateRange);

    const [
      fuelAgg,
      maintenanceAgg,
      tireAgg,
      retreadAgg,
      tollAgg,
      expenseGroups,
      fuelByVehicle,
      maintenanceByVehicle,
      tollByVehicle,
      monthlyTrend,
    ] = await Promise.all([
      this.prisma.fuelSupply.aggregate({ where: fuelWhere, _sum: { totalAmount: true } }),
      this.prisma.vehicleMaintenance.aggregate({ where: maintenanceWhere, _sum: { totalCost: true } }),
      this.prisma.tire.aggregate({ where: tireWhere, _sum: { purchasePrice: true } }),
      this.prisma.tireRetread.aggregate({ where: retreadWhere, _sum: { cost: true } }),
      this.prisma.tollTransaction.aggregate({ where: tollWhere, _sum: { chargedAmount: true } }),
      this.prisma.tripExpense.groupBy({ by: ['category'], where: expenseWhere, _sum: { amount: true } }),
      this.prisma.fuelSupply.groupBy({ by: ['vehicleId'], where: fuelWhere, _count: true, _sum: { totalAmount: true } }),
      this.prisma.vehicleMaintenance.groupBy({ by: ['vehicleId'], where: maintenanceWhere, _count: true, _sum: { totalCost: true } }),
      this.prisma.tollTransaction.groupBy({ by: ['vehicleId'], where: tollWhere, _count: true, _sum: { chargedAmount: true } }),
      this.computeCostsMonthlyTrend(tenantId, filters),
    ]);

    const fuelCost = toNumberOrNull(fuelAgg._sum.totalAmount) ?? 0;
    const maintenanceCost = toNumberOrNull(maintenanceAgg._sum.totalCost) ?? 0;
    const tireCost = (toNumberOrNull(tireAgg._sum.purchasePrice) ?? 0) + (toNumberOrNull(retreadAgg._sum.cost) ?? 0);
    const tollCost = toNumberOrNull(tollAgg._sum.chargedAmount) ?? 0;
    const otherCost = expenseGroups.reduce((sum, row) => sum + (toNumberOrNull(row._sum.amount) ?? 0), 0);
    const totalCost = fuelCost + maintenanceCost + tireCost + tollCost + otherCost;

    const costByCategory: FleetCostCategoryEntity[] = [
      this.toCostCategory('FUEL', fuelCost),
      this.toCostCategory('MAINTENANCE', maintenanceCost),
      this.toCostCategory('TIRES', tireCost),
      this.toCostCategory('TOLL', tollCost),
      ...expenseGroups.map((row) => this.toCostCategory(row.category, toNumberOrNull(row._sum.amount) ?? 0)),
    ];

    const merged = new Map<string, VehicleRankingAccumulator>();
    mergeVehicleAmounts(merged, fuelByVehicle, (row) => toNumberOrNull(row._sum.totalAmount) ?? 0);
    mergeVehicleAmounts(merged, maintenanceByVehicle, (row) => toNumberOrNull(row._sum.totalCost) ?? 0);
    mergeVehicleAmounts(merged, tollByVehicle, (row) => toNumberOrNull(row._sum.chargedAmount) ?? 0);

    const [topVehiclesByCost, costByFleet, previousPeriod] = await Promise.all([
      this.attachPlates(rankTopVehicles(merged, TOP_VEHICLES_LIMIT)),
      this.buildFleetRanking(merged),
      this.computePreviousPeriodCosts(tenantId, filters, totalCost),
    ]);

    const entity = new FleetCostsEntity();
    entity.totalCost = totalCost;
    entity.fuelCost = fuelCost;
    entity.maintenanceCost = maintenanceCost;
    entity.tireCost = tireCost;
    entity.tollCost = tollCost;
    entity.otherCost = otherCost;
    entity.costByCategory = costByCategory;
    entity.topVehiclesByCost = topVehiclesByCost;
    entity.averageCostPerVehicle = safeAverage(totalCost, merged.size);
    entity.costByFleet = costByFleet;
    entity.monthlyTrend = monthlyTrend;
    entity.previousPeriod = previousPeriod;
    return { entity, vehicleMap: merged };
  }

  // Ultimos 12 meses SEMPRE (ignora startDate/endDate do filtro, respeita
  // vehicleId/fleetId) -- mesmo padrao ja usado por DashboardService.getCharts.
  private async computeCostsMonthlyTrend(
    tenantId: string,
    filters: FleetOperationsFilters,
  ): Promise<DashboardChartPointEntity[]> {
    const floor = new Date();
    floor.setUTCMonth(floor.getUTCMonth() - (MONTHLY_TREND_MONTHS - 1), 1);
    floor.setUTCHours(0, 0, 0, 0);
    const trendRange: Prisma.DateTimeFilter = { gte: floor };

    const [fuelRows, maintenanceRows, tireRows, retreadRows, tollRows, expenseRows] = await Promise.all([
      this.prisma.fuelSupply.findMany({
        where: this.buildFuelWhere(tenantId, filters, trendRange),
        select: { supplyDate: true, totalAmount: true },
      }),
      this.prisma.vehicleMaintenance.findMany({
        where: this.buildMaintenanceWhere(tenantId, filters, trendRange),
        select: { openedAt: true, totalCost: true },
      }),
      this.prisma.tire.findMany({
        where: this.buildTireWhere(tenantId, filters, trendRange),
        select: { purchaseDate: true, purchasePrice: true },
      }),
      this.prisma.tireRetread.findMany({
        where: this.buildTireRetreadWhere(tenantId, filters, trendRange),
        select: { retreadDate: true, cost: true },
      }),
      this.prisma.tollTransaction.findMany({
        where: this.buildTollWhere(tenantId, filters, trendRange),
        select: { chargedAt: true, chargedAmount: true },
      }),
      this.prisma.tripExpense.findMany({
        where: this.buildOtherExpenseWhere(tenantId, filters, trendRange),
        select: { expenseDate: true, amount: true },
      }),
    ]);

    const rows = [
      ...fuelRows.map((r) => ({ date: r.supplyDate, value: toNumberOrNull(r.totalAmount) ?? 0 })),
      ...maintenanceRows.map((r) => ({ date: r.openedAt, value: toNumberOrNull(r.totalCost) ?? 0 })),
      ...tireRows
        .filter((r) => r.purchaseDate !== null)
        .map((r) => ({ date: r.purchaseDate as Date, value: toNumberOrNull(r.purchasePrice) ?? 0 })),
      ...retreadRows.map((r) => ({ date: r.retreadDate, value: toNumberOrNull(r.cost) ?? 0 })),
      ...tollRows.map((r) => ({ date: r.chargedAt, value: toNumberOrNull(r.chargedAmount) ?? 0 })),
      ...expenseRows.map((r) => ({ date: r.expenseDate, value: toNumberOrNull(r.amount) ?? 0 })),
    ];

    return aggregateMonthlySeries(rows, MONTHLY_TREND_MONTHS);
  }

  // Ranking por Vehicle.fleetId a partir do mapa por veiculo JA agregado
  // (nunca 1 query por veiculo) -- 2 queries em lote (veiculos, depois
  // frotas). fleetId=null vira o balde "Sem frota" (estado real).
  private async buildFleetRanking(merged: Map<string, VehicleRankingAccumulator>): Promise<FleetCostFleetEntity[]> {
    if (merged.size === 0) return [];

    const vehicles = await this.prisma.vehicle.findMany({
      where: { id: { in: [...merged.keys()] } },
      select: { id: true, fleetId: true },
    });
    const vehicleFleetMap = new Map(vehicles.map((v) => [v.id, v.fleetId]));
    const byFleet = mergeByFleet(merged, vehicleFleetMap);

    const fleetIds = [...byFleet.keys()].filter((id): id is string => id !== null);
    const fleets = fleetIds.length > 0
      ? await this.prisma.fleet.findMany({ where: { id: { in: fleetIds } }, select: { id: true, name: true } })
      : [];
    const fleetNameById = new Map(fleets.map((f) => [f.id, f.name]));

    return [...byFleet.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, TOP_FLEETS_LIMIT)
      .map(([fleetId, agg]) => {
        const entity = new FleetCostFleetEntity();
        entity.fleetId = fleetId;
        entity.fleetName = fleetId ? (fleetNameById.get(fleetId) ?? '—') : 'Sem frota';
        entity.amount = agg.value;
        return entity;
      });
  }

  // So calcula quando startDate E endDate sao ambos informados -- nunca um
  // "periodo anterior" inventado sem um periodo real de referencia (secao C
  // do pedido). Reusa a mesma agregacao de custos sobre o intervalo anterior
  // de mesma duracao (computePreviousPeriodRange).
  private async computePreviousPeriodCosts(
    tenantId: string,
    filters: FleetOperationsFilters,
    currentTotalCost: number,
  ): Promise<FleetCostsPreviousPeriodEntity | null> {
    if (!filters.startDate || !filters.endDate) return null;

    const previousRange = computePreviousPeriodRange(filters.startDate, filters.endDate);
    const previousFilters: FleetOperationsFilters = compact({
      startDate: previousRange.start,
      endDate: previousRange.end,
      vehicleId: filters.vehicleId,
      fleetId: filters.fleetId,
    });
    const dateRange = this.dateRangeFilter(previousFilters);

    const [fuelAgg, maintenanceAgg, tireAgg, retreadAgg, tollAgg, expenseAgg] = await Promise.all([
      this.prisma.fuelSupply.aggregate({ where: this.buildFuelWhere(tenantId, previousFilters, dateRange), _sum: { totalAmount: true } }),
      this.prisma.vehicleMaintenance.aggregate({ where: this.buildMaintenanceWhere(tenantId, previousFilters, dateRange), _sum: { totalCost: true } }),
      this.prisma.tire.aggregate({ where: this.buildTireWhere(tenantId, previousFilters, dateRange), _sum: { purchasePrice: true } }),
      this.prisma.tireRetread.aggregate({ where: this.buildTireRetreadWhere(tenantId, previousFilters, dateRange), _sum: { cost: true } }),
      this.prisma.tollTransaction.aggregate({ where: this.buildTollWhere(tenantId, previousFilters, dateRange), _sum: { chargedAmount: true } }),
      this.prisma.tripExpense.aggregate({ where: this.buildOtherExpenseWhere(tenantId, previousFilters, dateRange), _sum: { amount: true } }),
    ]);

    const previousTotalCost =
      (toNumberOrNull(fuelAgg._sum.totalAmount) ?? 0) +
      (toNumberOrNull(maintenanceAgg._sum.totalCost) ?? 0) +
      (toNumberOrNull(tireAgg._sum.purchasePrice) ?? 0) +
      (toNumberOrNull(retreadAgg._sum.cost) ?? 0) +
      (toNumberOrNull(tollAgg._sum.chargedAmount) ?? 0) +
      (toNumberOrNull(expenseAgg._sum.amount) ?? 0);

    const entity = new FleetCostsPreviousPeriodEntity();
    entity.totalCost = previousTotalCost;
    entity.deltaAmount = currentTotalCost - previousTotalCost;
    entity.deltaPercent = computeDeltaPercent(currentTotalCost, previousTotalCost);
    return entity;
  }

  // ==========================================================================
  // MAINTENANCE -- gap real (secao 6 do pedido): dashboard executivo so
  // soma total, sem breakdown. averageDurationHours calculado em memoria
  // sobre uma projecao minima (so 2 campos de data, nunca o registro
  // inteiro) -- Prisma nao agrega diferenca entre 2 colunas DateTime
  // nativamente sem SQL bruto, que este projeto evita. Endpoint proprio
  // (GET /fleet-operations/maintenance). Fase 41: + topVehiclesByCount
  // (ranking por frequencia) + monthlyTrend.
  // ==========================================================================
  async getMaintenanceDashboard(tenantId: string, query: FleetOperationsQueryDto): Promise<FleetMaintenanceDashboardEntity> {
    return (await this.computeMaintenanceDashboard(tenantId, this.parseFilters(query))).entity;
  }

  private async computeMaintenanceDashboard(
    tenantId: string,
    filters: FleetOperationsFilters,
  ): Promise<MaintenanceResult> {
    const dateRange = this.dateRangeFilter(filters);
    const where = this.buildMaintenanceWhere(tenantId, filters, dateRange);

    const [
      totalCount,
      openCount,
      completedCount,
      totalAgg,
      byTypeRaw,
      byPriorityRaw,
      byWorkshopRaw,
      byVehicleRaw,
      completedDurations,
      monthlyTrendRows,
    ] = await Promise.all([
      this.prisma.vehicleMaintenance.count({ where }),
      this.prisma.vehicleMaintenance.count({ where: { ...where, status: { in: OPEN_MAINTENANCE_STATUSES } } }),
      this.prisma.vehicleMaintenance.count({ where: { ...where, status: { in: CLOSED_MAINTENANCE_STATUSES } } }),
      this.prisma.vehicleMaintenance.aggregate({
        where,
        _sum: { totalCost: true },
        _count: { totalCost: true },
      }),
      this.prisma.vehicleMaintenance.groupBy({ by: ['type'], where, _count: true, _sum: { totalCost: true } }),
      this.prisma.vehicleMaintenance.groupBy({ by: ['priority'], where, _count: true }),
      this.prisma.vehicleMaintenance.groupBy({ by: ['workshop'], where, _count: true, _sum: { totalCost: true } }),
      this.prisma.vehicleMaintenance.groupBy({ by: ['vehicleId'], where, _count: true, _sum: { totalCost: true } }),
      this.prisma.vehicleMaintenance.findMany({
        where: { ...where, status: VehicleMaintenanceStatus.COMPLETED, completedAt: { not: null } },
        select: { openedAt: true, completedAt: true },
      }),
      this.prisma.vehicleMaintenance.findMany({
        where: this.buildMaintenanceWhere(tenantId, filters, this.trendDateRange()),
        select: { openedAt: true, totalCost: true },
      }),
    ]);

    const totalCost = toNumberOrNull(totalAgg._sum.totalCost) ?? 0;
    const costedCount = totalAgg._count.totalCost;

    const merged = new Map<string, VehicleRankingAccumulator>();
    mergeVehicleAmounts(merged, byVehicleRaw, (row) => toNumberOrNull(row._sum.totalCost) ?? 0);

    const [topVehiclesByCost, topVehiclesByCount] = await Promise.all([
      this.attachPlates(rankTopVehicles(merged, TOP_VEHICLES_LIMIT)),
      this.attachPlates(rankTopVehicles(merged, TOP_VEHICLES_LIMIT, 'count')),
    ]);

    const entity = new FleetMaintenanceDashboardEntity();
    entity.totalCount = totalCount;
    entity.openCount = openCount;
    entity.completedCount = completedCount;
    entity.totalCost = totalCost;
    entity.averageCostPerOccurrence = safeAverage(totalCost, costedCount);
    entity.averageDurationHours = computeAverageDurationHours(completedDurations);
    entity.byType = byTypeRaw.map((row) => ({
      type: row.type as VehicleMaintenanceType,
      count: row._count,
      cost: toNumberOrNull(row._sum.totalCost) ?? 0,
    }));
    entity.byPriority = byPriorityRaw.map((row) => ({
      priority: row.priority as VehicleMaintenancePriority,
      count: row._count,
    }));
    entity.byWorkshop = byWorkshopRaw.map((row) => ({
      workshop: row.workshop,
      count: row._count,
      cost: toNumberOrNull(row._sum.totalCost) ?? 0,
    }));
    entity.topVehiclesByCost = topVehiclesByCost;
    entity.topVehiclesByCount = topVehiclesByCount;
    entity.monthlyTrend = aggregateMonthlySeries(
      monthlyTrendRows.map((r) => ({ date: r.openedAt, value: toNumberOrNull(r.totalCost) ?? 0 })),
      MONTHLY_TREND_MONTHS,
    );
    return { entity, vehicleMap: merged };
  }

  // ==========================================================================
  // STOPS -- gap real (secao 8 do pedido): TripStopsService.findAll so
  // filtra por tripId, sem cross-frota. "Carga"/"descarga" nao existem
  // como TripStopType proprio (so UNKNOWN/FUEL/REST/MEAL/MAINTENANCE/
  // OTHER) -- nunca inventados, documentado em docs/fleet-operations-dashboard.md.
  // Endpoint proprio (GET /fleet-operations/stops). Fase 41: + monthlyTrend.
  // ==========================================================================
  async getStopsDashboard(tenantId: string, query: FleetOperationsQueryDto): Promise<FleetStopsDashboardEntity> {
    return (await this.computeStopsDashboard(tenantId, this.parseFilters(query))).entity;
  }

  private async computeStopsDashboard(tenantId: string, filters: FleetOperationsFilters): Promise<StopsResult> {
    const dateRange = this.dateRangeFilter(filters);
    const where = this.buildStopWhere(tenantId, filters, dateRange);

    const [totalAgg, byTypeRaw, byVehicleRaw, monthlyTrendRows] = await Promise.all([
      this.prisma.tripStop.aggregate({ where, _count: true, _sum: { durationMinutes: true } }),
      this.prisma.tripStop.groupBy({ by: ['type'], where, _count: true, _sum: { durationMinutes: true } }),
      this.prisma.tripStop.groupBy({ by: ['vehicleId'], where, _count: true, _sum: { durationMinutes: true } }),
      this.prisma.tripStop.findMany({
        where: this.buildStopWhere(tenantId, filters, this.trendDateRange()),
        select: { startedAt: true },
      }),
    ]);

    const totalStops = totalAgg._count;
    const totalDurationMinutes = totalAgg._sum.durationMinutes ?? 0;

    const merged = new Map<string, VehicleRankingAccumulator>();
    mergeVehicleAmounts(merged, byVehicleRaw, (row) => row._sum.durationMinutes ?? 0);

    const entity = new FleetStopsDashboardEntity();
    entity.totalStops = totalStops;
    entity.totalDurationMinutes = totalDurationMinutes;
    entity.averageDurationMinutes = safeAverage(totalDurationMinutes, totalStops);
    entity.byType = byTypeRaw.map((row) => ({
      type: row.type as TripStopType,
      count: row._count,
      totalDurationMinutes: row._sum.durationMinutes ?? 0,
    }));
    entity.topVehiclesByDuration = await this.attachPlates(rankTopVehicles(merged, TOP_VEHICLES_LIMIT));
    entity.monthlyTrend = aggregateMonthlySeries(
      monthlyTrendRows.map((r) => ({ date: r.startedAt, value: 1 })),
      MONTHLY_TREND_MONTHS,
    );
    return { entity, vehicleMap: merged };
  }

  // ==========================================================================
  // FUEL ANALYTICS -- Fase 42, gestao avancada de abastecimento. Metodologia
  // de consumo/custo-por-km reaproveitada de common/utils/fuel-consumption.util.ts
  // (computeConsumptionTotals) -- a MESMA ja usada por
  // FuelSuppliesService.getDashboard() (nunca uma nova): distancia entre o
  // primeiro e o ultimo odometro de um veiculo no escopo filtrado, litros
  // abastecidos entre eles. So calculado com >= MIN_SUPPLIES_FOR_CONSUMPTION
  // abastecimentos; caso contrario `available: false`. "costPerKm" aqui e
  // CUSTO DE COMBUSTIVEL por km (real, disponivel via esta metodologia) --
  // distinto do "custo total da frota por km" que a Fase 41 documentou como
  // indisponivel (dependeria de TripMetrics.actualDistanceKm, nunca escrito
  // por nenhum service). Endpoint proprio (GET /fleet-operations/fuel).
  // Sempre O(1) queries independente do nº de veiculos (ver
  // fleet-operations-fuel.e2e-spec.ts, verificacao de N+1).
  // ==========================================================================
  async getFuelAnalytics(tenantId: string, query: FleetOperationsQueryDto): Promise<FleetFuelAnalyticsEntity> {
    return this.computeFuelAnalytics(tenantId, this.parseFilters(query));
  }

  private async computeFuelAnalytics(tenantId: string, filters: FleetOperationsFilters): Promise<FleetFuelAnalyticsEntity> {
    const dateRange = this.dateRangeFilter(filters);
    const where = this.buildFuelWhere(tenantId, filters, dateRange);

    const [rows, monthlyTrendRows] = await Promise.all([
      this.prisma.fuelSupply.findMany({
        where,
        select: { id: true, vehicleId: true, supplyDate: true, odometerKm: true, liters: true, totalAmount: true },
      }),
      this.prisma.fuelSupply.findMany({
        where: this.buildFuelWhere(tenantId, filters, this.trendDateRange()),
        select: { supplyDate: true, totalAmount: true, liters: true },
      }),
    ]);

    const points = rows.map((r) => ({
      id: r.id,
      vehicleId: r.vehicleId,
      supplyDate: r.supplyDate,
      odometerKm: toNumberOrNull(r.odometerKm) ?? 0,
      liters: toNumberOrNull(r.liters) ?? 0,
      totalAmount: toNumberOrNull(r.totalAmount) ?? 0,
    }));

    const pointsByVehicle = new Map<string, typeof points>();
    for (const point of points) {
      const list = pointsByVehicle.get(point.vehicleId) ?? [];
      list.push(point);
      pointsByVehicle.set(point.vehicleId, list);
    }

    const totalCost = points.reduce((sum, p) => sum + p.totalAmount, 0);
    const totalLiters = points.reduce((sum, p) => sum + p.liters, 0);
    const supplyCount = points.length;

    const fuelAggregateByVehicle = new Map<string, FuelVehicleAggregate>();
    const consumptionByVehicle = new Map<string, FleetFuelConsumptionEntity>();
    const costPerKmByVehicle = new Map<string, FleetFuelCostPerKmEntity>();
    const anomalyByVehicle = new Map<string, boolean>();

    for (const [vehicleId, vehiclePoints] of pointsByVehicle) {
      const cost = vehiclePoints.reduce((sum, p) => sum + p.totalAmount, 0);
      const liters = vehiclePoints.reduce((sum, p) => sum + p.liters, 0);
      const count = vehiclePoints.length;

      const totals =
        count >= MIN_SUPPLIES_FOR_CONSUMPTION
          ? computeConsumptionTotals(vehiclePoints.map((p) => ({ id: p.id, odometerKm: p.odometerKm, liters: p.liters })))
          : null;

      fuelAggregateByVehicle.set(vehicleId, {
        cost,
        liters,
        count,
        consumptionDistanceKm: totals?.totalDistanceKm ?? 0,
        consumptionLiters: totals?.totalLiters ?? 0,
      });

      consumptionByVehicle.set(vehicleId, this.buildConsumptionEntity(totals));
      costPerKmByVehicle.set(vehicleId, this.buildCostPerKmEntity(cost, totals));

      const regressions = detectOdometerRegression(vehiclePoints);
      anomalyByVehicle.set(vehicleId, regressions.length > 0);
    }

    const vehicleIds = [...pointsByVehicle.keys()];

    const [vehicleRecords, previousPeriod] = await Promise.all([
      vehicleIds.length > 0
        ? this.prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, plate: true, fleetId: true } })
        : Promise.resolve([]),
      this.computePreviousPeriodFuel(tenantId, filters, totalCost, totalLiters, supplyCount),
    ]);

    const plateById = new Map(vehicleRecords.map((v) => [v.id, v.plate]));
    const fleetIdByVehicle = new Map(vehicleRecords.map((v) => [v.id, v.fleetId]));
    const fleetIds = [...new Set(vehicleRecords.map((v) => v.fleetId).filter((id): id is string => id !== null))];
    const fleets =
      fleetIds.length > 0
        ? await this.prisma.fleet.findMany({ where: { id: { in: fleetIds } }, select: { id: true, name: true } })
        : [];
    const fleetNameById = new Map(fleets.map((f) => [f.id, f.name]));
    const fleetName = (fleetId: string | null): string => (fleetId ? (fleetNameById.get(fleetId) ?? '—') : 'Sem frota');

    // ---- vehicleBreakdown (secao B do pedido) -- TODOS os veiculos com
    // dado no escopo, ordenados por custo total, com posicao no ranking. ----
    const sortedVehicleIds = [...fuelAggregateByVehicle.entries()]
      .sort((a, b) => b[1].cost - a[1].cost)
      .map(([vehicleId]) => vehicleId);

    const vehicleBreakdown: FleetFuelVehicleBreakdownEntity[] = sortedVehicleIds.map((vehicleId, index) => {
      const agg = fuelAggregateByVehicle.get(vehicleId);
      if (!agg) throw new Error('Inconsistencia interna: veiculo sem agregado.');
      const fleetId = fleetIdByVehicle.get(vehicleId) ?? null;
      const entity = new FleetFuelVehicleBreakdownEntity();
      entity.vehicleId = vehicleId;
      entity.plate = plateById.get(vehicleId) ?? '—';
      entity.fleetId = fleetId;
      entity.fleetName = fleetName(fleetId);
      entity.supplyCount = agg.count;
      entity.liters = agg.liters;
      entity.cost = agg.cost;
      entity.averagePricePerLiter = safeAverage(agg.cost, agg.liters);
      entity.consumption = consumptionByVehicle.get(vehicleId) ?? this.buildConsumptionEntity(null);
      entity.costPerKm = costPerKmByVehicle.get(vehicleId) ?? this.buildCostPerKmEntity(agg.cost, null);
      entity.rankPosition = index + 1;
      entity.hasOdometerAnomaly = anomalyByVehicle.get(vehicleId) ?? false;
      return entity;
    });

    // ---- fleetBreakdown (secao F do pedido) ----
    const fleetAggMap = mergeFuelByFleet(fuelAggregateByVehicle, fleetIdByVehicle);
    const fleetBreakdown: FleetFuelFleetBreakdownEntity[] = [...fleetAggMap.entries()]
      .sort((a, b) => b[1].cost - a[1].cost)
      .map(([fleetId, agg]) => {
        const entity = new FleetFuelFleetBreakdownEntity();
        entity.fleetId = fleetId;
        entity.fleetName = fleetName(fleetId);
        entity.supplyCount = agg.count;
        entity.liters = agg.liters;
        entity.cost = agg.cost;
        entity.averagePricePerLiter = safeAverage(agg.cost, agg.liters);
        entity.consumption = this.buildConsumptionEntity(this.toTotalsOrNull(agg.consumptionDistanceKm, agg.consumptionLiters));
        return entity;
      });

    // ---- consumo/custo-por-km agregados da frota inteira (mesma formula
    // de FuelSuppliesService.getDashboard, soma dos segmentos de cada
    // veiculo antes de dividir) ----
    let totalConsumptionDistanceKm = 0;
    let totalConsumptionLiters = 0;
    for (const agg of fuelAggregateByVehicle.values()) {
      totalConsumptionDistanceKm += agg.consumptionDistanceKm;
      totalConsumptionLiters += agg.consumptionLiters;
    }
    const fleetWideTotals = this.toTotalsOrNull(totalConsumptionDistanceKm, totalConsumptionLiters);
    const consumption = this.buildConsumptionEntity(fleetWideTotals);
    const costPerKm = this.buildCostPerKmEntity(totalCost, fleetWideTotals);

    // ---- rankings (secao E do pedido) -- placas resolvidas em memoria via
    // plateById JA buscado em lote acima, nunca 1 query por ranking. ----
    const rankings = this.buildFuelRankings(fuelAggregateByVehicle, consumptionByVehicle, plateById);

    // ---- alertas (secao I do pedido) ----
    const alerts = this.computeFuelAlerts(fuelAggregateByVehicle, consumptionByVehicle, anomalyByVehicle, points, plateById);

    const summary = new FleetFuelSummaryEntity();
    summary.totalCost = totalCost;
    summary.totalLiters = totalLiters;
    summary.supplyCount = supplyCount;
    summary.averagePricePerLiter = safeAverage(totalCost, totalLiters);
    summary.averageCostPerSupply = safeAverage(totalCost, supplyCount);
    summary.vehiclesSupplied = pointsByVehicle.size;
    // fleetAggMap inclui o balde `null` ("Sem frota") -- nao e uma frota
    // real, entao nunca conta aqui (mesmo principio de fleetName(null) =
    // "Sem frota" ser so um rotulo de exibicao, nunca um Fleet de verdade).
    summary.fleetsSupplied = [...fleetAggMap.keys()].filter((fleetId): fleetId is string => fleetId !== null).length;

    const entity = new FleetFuelAnalyticsEntity();
    entity.summary = summary;
    entity.consumption = consumption;
    entity.costPerKm = costPerKm;
    entity.monthlyTrendCost = aggregateMonthlySeries(
      monthlyTrendRows.map((r) => ({ date: r.supplyDate, value: toNumberOrNull(r.totalAmount) ?? 0 })),
      MONTHLY_TREND_MONTHS,
    );
    entity.monthlyTrendLiters = aggregateMonthlySeries(
      monthlyTrendRows.map((r) => ({ date: r.supplyDate, value: toNumberOrNull(r.liters) ?? 0 })),
      MONTHLY_TREND_MONTHS,
    );
    entity.monthlyTrendSupplyCount = aggregateMonthlySeries(
      monthlyTrendRows.map((r) => ({ date: r.supplyDate, value: 1 })),
      MONTHLY_TREND_MONTHS,
    );
    entity.vehicleBreakdown = vehicleBreakdown;
    entity.fleetBreakdown = fleetBreakdown;
    entity.rankings = rankings;
    entity.alerts = alerts;
    entity.previousPeriod = previousPeriod;
    return entity;
  }

  private toTotalsOrNull(totalDistanceKm: number, totalLiters: number): FuelConsumptionTotals | null {
    return totalDistanceKm > 0 || totalLiters > 0 ? { totalDistanceKm, totalLiters } : null;
  }

  private buildConsumptionEntity(totals: FuelConsumptionTotals | null): FleetFuelConsumptionEntity {
    const entity = new FleetFuelConsumptionEntity();
    entity.unit = 'km/l';
    if (!totals || totals.totalLiters <= 0) {
      entity.value = null;
      entity.available = false;
      entity.reason = 'INSUFFICIENT_ODOMETER_READINGS';
      return entity;
    }
    entity.value = totals.totalDistanceKm / totals.totalLiters;
    entity.available = true;
    entity.reason = null;
    return entity;
  }

  private buildCostPerKmEntity(cost: number, totals: FuelConsumptionTotals | null): FleetFuelCostPerKmEntity {
    const entity = new FleetFuelCostPerKmEntity();
    if (!totals || totals.totalDistanceKm <= 0) {
      entity.value = null;
      entity.available = false;
      entity.reason = 'INSUFFICIENT_ODOMETER_READINGS';
      return entity;
    }
    entity.value = cost / totals.totalDistanceKm;
    entity.available = true;
    entity.reason = null;
    return entity;
  }

  // Constroi as entidades de ranking diretamente do plateById JA buscado em
  // lote pelo chamador -- nunca chama attachPlates (que faria 1 query de
  // placas POR ranking, 8x desnecessario aqui).
  private toRankingEntities(ranking: VehicleRankingEntry[], plateById: Map<string, string>): FleetVehicleRankingEntryEntity[] {
    return ranking.map((entry) => {
      const entity = new FleetVehicleRankingEntryEntity();
      entity.vehicleId = entry.vehicleId;
      entity.plate = plateById.get(entry.vehicleId) ?? '—';
      entity.value = entry.value;
      entity.count = entry.count;
      return entity;
    });
  }

  private buildFuelRankings(
    fuelAggregateByVehicle: Map<string, FuelVehicleAggregate>,
    consumptionByVehicle: Map<string, FleetFuelConsumptionEntity>,
    plateById: Map<string, string>,
  ): FleetFuelRankingsEntity {
    const costMap = new Map<string, VehicleRankingAccumulator>();
    const volumeMap = new Map<string, VehicleRankingAccumulator>();
    const priceMap = new Map<string, VehicleRankingAccumulator>();
    const consumptionMap = new Map<string, VehicleRankingAccumulator>();
    const supplyCountMap = new Map<string, VehicleRankingAccumulator>();

    for (const [vehicleId, agg] of fuelAggregateByVehicle) {
      costMap.set(vehicleId, { value: agg.cost, count: agg.count });
      volumeMap.set(vehicleId, { value: agg.liters, count: agg.count });
      priceMap.set(vehicleId, { value: safeAverage(agg.cost, agg.liters) ?? 0, count: agg.count });
      // "value"="count" aqui de proposito -- mesma convencao ja usada em
      // topVehiclesByTripCount (Fase 41): rankings ordenados por contagem
      // expoem o proprio numero de ocorrencias como "value", nao outra metrica.
      supplyCountMap.set(vehicleId, { value: agg.count, count: agg.count });

      // Rankings de consumo SO consideram veiculos com dado suficiente --
      // nunca um veiculo sem consumo disponivel aparecendo artificialmente
      // como "melhor"/"pior" (secao E do pedido).
      const consumptionEntity = consumptionByVehicle.get(vehicleId);
      if (consumptionEntity?.available && consumptionEntity.value !== null) {
        consumptionMap.set(vehicleId, { value: consumptionEntity.value, count: agg.count });
      }
    }

    const rankings = new FleetFuelRankingsEntity();
    rankings.topCost = this.toRankingEntities(rankTopVehicles(costMap, TOP_VEHICLES_LIMIT, 'value', 'desc'), plateById);
    rankings.bottomCost = this.toRankingEntities(rankTopVehicles(costMap, TOP_VEHICLES_LIMIT, 'value', 'asc'), plateById);
    rankings.topVolume = this.toRankingEntities(rankTopVehicles(volumeMap, TOP_VEHICLES_LIMIT, 'value', 'desc'), plateById);
    rankings.bottomVolume = this.toRankingEntities(rankTopVehicles(volumeMap, TOP_VEHICLES_LIMIT, 'value', 'asc'), plateById);
    rankings.bestConsumption = this.toRankingEntities(rankTopVehicles(consumptionMap, TOP_VEHICLES_LIMIT, 'value', 'desc'), plateById);
    rankings.worstConsumption = this.toRankingEntities(rankTopVehicles(consumptionMap, TOP_VEHICLES_LIMIT, 'value', 'asc'), plateById);
    rankings.topPricePerLiter = this.toRankingEntities(rankTopVehicles(priceMap, TOP_VEHICLES_LIMIT, 'value', 'desc'), plateById);
    rankings.topSupplyCount = this.toRankingEntities(rankTopVehicles(supplyCountMap, TOP_VEHICLES_LIMIT, 'count', 'desc'), plateById);
    return rankings;
  }

  // Secao I do pedido. "Registro sem quilometragem" NAO e implementado --
  // FuelSupply.odometerKm e obrigatorio no schema (nunca nulo), o cenario e
  // estruturalmente impossivel neste dominio (ver docs/fuel-operations-dashboard.md).
  // "Abastecimentos incompativeis entre si" fica coberto pela combinacao de
  // ODOMETER_REGRESSION + outliers de consumo, nunca um alerta novo e vago.
  private computeFuelAlerts(
    fuelAggregateByVehicle: Map<string, FuelVehicleAggregate>,
    consumptionByVehicle: Map<string, FleetFuelConsumptionEntity>,
    anomalyByVehicle: Map<string, boolean>,
    points: { vehicleId: string; liters: number }[],
    plateById: Map<string, string>,
  ): FleetAlertEntity[] {
    const alerts: FleetAlertEntity[] = [];

    const priceMap = new Map<string, VehicleRankingAccumulator>();
    for (const [vehicleId, agg] of fuelAggregateByVehicle) {
      priceMap.set(vehicleId, { value: safeAverage(agg.cost, agg.liters) ?? 0, count: agg.count });
    }
    const priceAverage = safeAverage([...priceMap.values()].reduce((sum, v) => sum + v.value, 0), priceMap.size) ?? 0;
    this.pushOutlierAlerts(
      alerts,
      priceMap,
      plateById,
      priceAverage,
      PRICE_PER_LITER_OUTLIER_MULTIPLIER,
      'FUEL_PRICE_OUTLIER',
      'ATTENTION',
      (value) => `Preco medio por litro (${this.formatBrl(value)}) acima da media da frota.`,
    );

    const consumptionMap = new Map<string, VehicleRankingAccumulator>();
    for (const [vehicleId, entity] of consumptionByVehicle) {
      if (entity.available && entity.value !== null) consumptionMap.set(vehicleId, { value: entity.value, count: 0 });
    }
    const consumptionAverage =
      safeAverage([...consumptionMap.values()].reduce((sum, v) => sum + v.value, 0), consumptionMap.size) ?? 0;
    this.pushOutlierAlerts(
      alerts,
      consumptionMap,
      plateById,
      consumptionAverage,
      CONSUMPTION_OUTLIER_MULTIPLIER,
      'CONSUMPTION_OUTLIER_HIGH',
      'INFO',
      (value) => `Consumo (${value.toFixed(1)} km/L) muito acima da media da frota -- verificar hodometro.`,
    );
    this.pushOutlierAlerts(
      alerts,
      consumptionMap,
      plateById,
      consumptionAverage,
      CONSUMPTION_OUTLIER_MULTIPLIER,
      'CONSUMPTION_OUTLIER_LOW',
      'ATTENTION',
      (value) => `Consumo (${value.toFixed(1)} km/L) muito abaixo da media da frota.`,
      'value',
      isLowOutlier,
    );

    const avgLitersPerSupply = safeAverage(points.reduce((sum, p) => sum + p.liters, 0), points.length) ?? 0;
    let volumeAlertCount = 0;
    for (const point of points) {
      if (volumeAlertCount >= ALERTS_LIMIT_PER_TYPE) break;
      if (!isOutlier(point.liters, avgLitersPerSupply, SUPPLY_VOLUME_OUTLIER_MULTIPLIER)) continue;
      alerts.push(
        this.buildAlert(
          'SUPPLY_VOLUME_OUTLIER',
          'ATTENTION',
          point.vehicleId,
          plateById,
          `Abastecimento de ${point.liters.toFixed(1)} L -- muito acima da media da frota.`,
          point.liters,
        ),
      );
      volumeAlertCount += 1;
    }

    let regressionCount = 0;
    for (const [vehicleId, hasAnomaly] of anomalyByVehicle) {
      if (regressionCount >= ALERTS_LIMIT_PER_TYPE) break;
      if (!hasAnomaly) continue;
      alerts.push(
        this.buildAlert(
          'ODOMETER_REGRESSION',
          'CRITICAL',
          vehicleId,
          plateById,
          'Registro com inconsistencia de hodometro (queda no valor entre abastecimentos consecutivos).',
          null,
        ),
      );
      regressionCount += 1;
    }

    return alerts;
  }

  // So calcula quando startDate E endDate sao ambos informados -- nunca um
  // "periodo anterior" inventado sem um periodo real de referencia (mesma
  // regra de computePreviousPeriodCosts, Fase 41).
  private async computePreviousPeriodFuel(
    tenantId: string,
    filters: FleetOperationsFilters,
    currentCost: number,
    currentLiters: number,
    currentSupplyCount: number,
  ): Promise<FleetFuelPreviousPeriodEntity | null> {
    if (!filters.startDate || !filters.endDate) return null;

    const previousRange = computePreviousPeriodRange(filters.startDate, filters.endDate);
    const previousFilters: FleetOperationsFilters = compact({
      startDate: previousRange.start,
      endDate: previousRange.end,
      vehicleId: filters.vehicleId,
      fleetId: filters.fleetId,
    });
    const dateRange = this.dateRangeFilter(previousFilters);

    const agg = await this.prisma.fuelSupply.aggregate({
      where: this.buildFuelWhere(tenantId, previousFilters, dateRange),
      _sum: { totalAmount: true, liters: true },
      _count: { _all: true },
    });

    const previousCost = toNumberOrNull(agg._sum.totalAmount) ?? 0;
    const previousLiters = toNumberOrNull(agg._sum.liters) ?? 0;
    const previousSupplyCount = agg._count._all;

    const entity = new FleetFuelPreviousPeriodEntity();
    entity.currentCost = currentCost;
    entity.previousCost = previousCost;
    entity.costDeltaPercent = computeDeltaPercent(currentCost, previousCost);
    entity.currentLiters = currentLiters;
    entity.previousLiters = previousLiters;
    entity.litersDeltaPercent = computeDeltaPercent(currentLiters, previousLiters);
    entity.currentSupplyCount = currentSupplyCount;
    entity.previousSupplyCount = previousSupplyCount;
    entity.supplyCountDeltaPercent = computeDeltaPercent(currentSupplyCount, previousSupplyCount);
    return entity;
  }

  // ==========================================================================
  // OPERATIONAL INDICATORS -- gap real (secao H do pedido). Endpoint
  // proprio (GET /fleet-operations/operations). "Custo medio por viagem" e
  // uma APROXIMACAO documentada (totalCost do escopo / viagens concluidas
  // no escopo), ja que nem todo registro de custo tem tripId (ex: compra de
  // pneu). "Utilizacao" so e calculada quando o periodo (startDate+endDate)
  // e informado -- sem isso nao ha denominador confiavel.
  // ==========================================================================
  async getOperationalIndicators(tenantId: string, query: FleetOperationsQueryDto): Promise<FleetOperationalIndicatorsEntity> {
    const filters = this.parseFilters(query);
    const { entity: costs } = await this.computeCosts(tenantId, filters);
    return this.computeOperationalIndicators(tenantId, filters, costs.totalCost);
  }

  private async computeOperationalIndicators(
    tenantId: string,
    filters: FleetOperationsFilters,
    totalCost: number,
  ): Promise<FleetOperationalIndicatorsEntity> {
    const tripWhere = this.buildTripWhere(tenantId, filters, undefined);
    const metricsWhere = this.buildTripMetricsWhere(tenantId, filters);

    const [completedTrips, inProgressTrips, cancelledTrips, durationAgg, activeVehiclesCount, completedTripRows] =
      await Promise.all([
        this.prisma.trip.count({ where: { ...tripWhere, status: TripStatus.COMPLETED } }),
        this.prisma.trip.count({ where: { ...tripWhere, status: { in: ACTIVE_TRIP_STATUSES } } }),
        this.prisma.trip.count({ where: { ...tripWhere, status: TripStatus.CANCELLED } }),
        this.prisma.tripMetrics.aggregate({
          where: metricsWhere,
          _avg: { actualDurationMin: true },
          _sum: { actualDurationMin: true },
        }),
        this.prisma.vehicle.count({ where: { ...this.buildVehicleWhere(tenantId, filters), status: VehicleStatus.ACTIVE } }),
        this.prisma.trip.findMany({
          where: { ...tripWhere, status: TripStatus.COMPLETED },
          select: { composition: { select: { vehicleId: true } } },
        }),
      ]);

    const tripCountByVehicle = new Map<string, VehicleRankingAccumulator>();
    for (const row of completedTripRows) {
      const vehicleId = row.composition?.vehicleId;
      if (!vehicleId) continue;
      const current = tripCountByVehicle.get(vehicleId) ?? { value: 0, count: 0 };
      current.value += 1;
      current.count += 1;
      tripCountByVehicle.set(vehicleId, current);
    }

    const entity = new FleetOperationalIndicatorsEntity();
    entity.completedTrips = completedTrips;
    entity.inProgressTrips = inProgressTrips;
    entity.cancelledTrips = cancelledTrips;
    entity.averageTripDurationMinutes = durationAgg._avg.actualDurationMin ?? null;
    entity.averageCostPerTrip = safeAverage(totalCost, completedTrips);
    entity.utilizationPercent = this.computeUtilizationPercent(filters, durationAgg._sum.actualDurationMin, activeVehiclesCount);
    entity.topVehiclesByTripCount = await this.attachPlates(rankTopVehicles(tripCountByVehicle, TOP_VEHICLES_LIMIT, 'count'));
    return entity;
  }

  // Sum(actualDurationMin) / (duracao do periodo em minutos * quantidade de
  // veiculos ativos no escopo) -- normalizado pela "capacidade" da frota
  // (period-minutos por veiculo), nunca uma razao bruta que poderia passar
  // de 100% com mais de 1 veiculo. Null sem periodo informado ou sem
  // veiculo ativo no escopo (denominador degenerado).
  private computeUtilizationPercent(
    filters: FleetOperationsFilters,
    sumActualDurationMin: number | null,
    activeVehiclesCount: number,
  ): number | null {
    if (!filters.startDate || !filters.endDate || activeVehiclesCount <= 0) return null;
    const periodMinutes = (filters.endDate.getTime() - filters.startDate.getTime()) / (1000 * 60);
    if (periodMinutes <= 0) return null;
    const capacityMinutes = periodMinutes * activeVehiclesCount;
    return ((sumActualDurationMin ?? 0) / capacityMinutes) * 100;
  }

  // ==========================================================================
  // ALERTAS -- secao J do pedido. Computados inteiramente a partir de mapas
  // JA agregados por computeCosts/computeMaintenanceDashboard/
  // computeStopsDashboard (sem query pesada extra) + 2 queries leves
  // (parada em aberto ha muito tempo, checklist pendente por veiculo).
  // NUNCA persistidos -- ver comentario em fleet-alert.entity.ts.
  // ==========================================================================
  private async computeAlerts(
    tenantId: string,
    filters: FleetOperationsFilters,
    costMap: Map<string, VehicleRankingAccumulator>,
    maintenanceMap: Map<string, VehicleRankingAccumulator>,
    stopMap: Map<string, VehicleRankingAccumulator>,
  ): Promise<FleetAlertEntity[]> {
    const [stalledRows, pendingChecklistRows] = await Promise.all([
      this.prisma.tripStop.findMany({
        where: {
          tenantId,
          endedAt: null,
          startedAt: { lte: new Date(Date.now() - STALLED_STOP_MINUTES * 60 * 1000) },
          ...this.vehicleFleetFilter(filters),
          ...compact({ vehicleId: filters.vehicleId }),
        },
        select: { vehicleId: true, startedAt: true },
      }),
      this.prisma.checklistExecution.groupBy({
        by: ['vehicleId'],
        where: {
          tenantId,
          status: { in: PENDING_CHECKLIST_STATUSES },
          vehicleId: { not: null },
          ...this.vehicleFleetFilter(filters),
          ...compact({ vehicleId: filters.vehicleId }),
        },
        _count: true,
      }),
    ]);

    // Uma parada aberta por veiculo -- a mais antiga, caso existam varias.
    const stalledByVehicle = new Map<string, Date>();
    for (const row of stalledRows) {
      if (!row.vehicleId) continue;
      const current = stalledByVehicle.get(row.vehicleId);
      if (!current || row.startedAt < current) stalledByVehicle.set(row.vehicleId, row.startedAt);
    }

    const allVehicleIds = new Set<string>([
      ...costMap.keys(),
      ...maintenanceMap.keys(),
      ...stopMap.keys(),
      ...stalledByVehicle.keys(),
      ...pendingChecklistRows.map((r) => r.vehicleId).filter((id): id is string => id !== null),
    ]);
    const plateById = await this.buildPlateMap([...allVehicleIds]);

    const alerts: FleetAlertEntity[] = [];

    const costAverage = safeAverage([...costMap.values()].reduce((sum, v) => sum + v.value, 0), costMap.size) ?? 0;
    this.pushOutlierAlerts(alerts, costMap, plateById, costAverage, COST_OUTLIER_MULTIPLIER, 'COST_OUTLIER', 'ATTENTION', (value) =>
      `Custo total (${this.formatBrl(value)}) acima da media da frota.`,
    );

    const maintenanceCountAverage =
      safeAverage([...maintenanceMap.values()].reduce((sum, v) => sum + v.count, 0), maintenanceMap.size) ?? 0;
    this.pushOutlierAlerts(
      alerts,
      maintenanceMap,
      plateById,
      maintenanceCountAverage,
      MAINTENANCE_COUNT_OUTLIER_MULTIPLIER,
      'MAINTENANCE_OUTLIER',
      'ATTENTION',
      (value) => `${value} manutencoes no periodo -- frequencia acima da media da frota.`,
      'count',
    );

    const stopAverage = safeAverage([...stopMap.values()].reduce((sum, v) => sum + v.value, 0), stopMap.size) ?? 0;
    this.pushOutlierAlerts(alerts, stopMap, plateById, stopAverage, STOP_TIME_OUTLIER_MULTIPLIER, 'STOP_TIME_OUTLIER', 'ATTENTION', (value) =>
      `${Math.round(value)} minutos parado no periodo -- acima da media da frota.`,
    );

    let stalledCount = 0;
    for (const [vehicleId, startedAt] of stalledByVehicle.entries()) {
      if (stalledCount >= ALERTS_LIMIT_PER_TYPE) break;
      const minutesOpen = Math.round((Date.now() - startedAt.getTime()) / (1000 * 60));
      alerts.push(this.buildAlert('STALLED_VEHICLE', 'CRITICAL', vehicleId, plateById, `Parada em aberto ha ${minutesOpen} minutos.`, minutesOpen));
      stalledCount += 1;
    }

    let pendingCount = 0;
    for (const row of pendingChecklistRows) {
      if (!row.vehicleId || pendingCount >= ALERTS_LIMIT_PER_TYPE) continue;
      alerts.push(
        this.buildAlert('PENDING_CHECKLIST', 'INFO', row.vehicleId, plateById, `${row._count} checklist(s) pendente(s).`, row._count),
      );
      pendingCount += 1;
    }

    return alerts;
  }

  private pushOutlierAlerts(
    alerts: FleetAlertEntity[],
    map: Map<string, VehicleRankingAccumulator>,
    plateById: Map<string, string>,
    average: number,
    multiplier: number,
    type: FleetAlertType,
    severity: FleetAlertSeverity,
    message: (value: number) => string,
    metric: 'value' | 'count' = 'value',
    isMatch: (value: number, average: number, multiplier: number) => boolean = isOutlier,
  ): void {
    let emitted = 0;
    for (const [vehicleId, agg] of [...map.entries()].sort((a, b) => b[1][metric] - a[1][metric])) {
      if (emitted >= ALERTS_LIMIT_PER_TYPE) break;
      const value = agg[metric];
      if (!isMatch(value, average, multiplier)) continue;
      alerts.push(this.buildAlert(type, severity, vehicleId, plateById, message(value), value));
      emitted += 1;
    }
  }

  private buildAlert(
    type: FleetAlertType,
    severity: FleetAlertSeverity,
    vehicleId: string,
    plateById: Map<string, string>,
    message: string,
    value: number | null,
  ): FleetAlertEntity {
    const entity = new FleetAlertEntity();
    entity.type = type;
    entity.severity = severity;
    entity.vehicleId = vehicleId;
    entity.plate = plateById.get(vehicleId) ?? '—';
    entity.message = message;
    entity.value = value;
    return entity;
  }

  private formatBrl(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }

  // ==========================================================================
  // CHECKLIST -- gap real (secao 28 do pedido): hasCriticalNonConformity
  // so era calculado por execucao individual. Nao-conformidade agregada em
  // 1 unica query (distinct executionId), nunca em loop por execucao.
  // ==========================================================================
  private async getChecklistSummary(
    tenantId: string,
    filters: FleetOperationsFilters,
  ): Promise<FleetChecklistSummaryEntity> {
    const where = this.buildChecklistWhere(tenantId, filters);

    const [totalExecutions, completedExecutions, pendingExecutions, nonConformingAnswers] = await Promise.all([
      this.prisma.checklistExecution.count({ where }),
      this.prisma.checklistExecution.count({ where: { ...where, status: ChecklistExecutionStatus.COMPLETED } }),
      this.prisma.checklistExecution.count({ where: { ...where, status: { in: PENDING_CHECKLIST_STATUSES } } }),
      this.prisma.checklistAnswer.findMany({
        where: {
          booleanValue: false,
          item: { critical: true, required: true },
          execution: where,
        },
        distinct: ['executionId'],
        select: { executionId: true },
      }),
    ]);

    const entity = new FleetChecklistSummaryEntity();
    entity.totalExecutions = totalExecutions;
    entity.completedExecutions = completedExecutions;
    entity.pendingExecutions = pendingExecutions;
    entity.criticalNonConformityCount = nonConformingAnswers.length;
    return entity;
  }

  private buildChecklistWhere(tenantId: string, filters: FleetOperationsFilters): Prisma.ChecklistExecutionWhereInput {
    const dateRange = this.dateRangeFilter(filters);
    return {
      tenantId,
      ...compact({ vehicleId: filters.vehicleId, startedAt: dateRange }),
      ...this.vehicleFleetFilter(filters),
    };
  }

  // ==========================================================================
  // Helpers compartilhados
  // ==========================================================================

  private parseFilters(query: FleetOperationsQueryDto): FleetOperationsFilters {
    return compact({
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      vehicleId: query.vehicleId,
      fleetId: query.fleetId,
    });
  }

  // fleetId filtra pela relacao Vehicle.fleetId (agrupamento organizacional
  // opcional). Aplicavel em todas as agregacoes proprias desta fase; NAO
  // aplicavel aos cards `fuel`/`tires` do dashboard consolidado, que
  // reaproveitam FuelSuppliesService/TiresService.getDashboard() tal como
  // existem hoje (fuel so aceita vehicleId; tires nao aceita nenhum filtro
  // alem de tenantId) -- documentado em docs/fleet-operations-dashboard.md,
  // nunca reimplementado aqui para nao duplicar esses services.
  private vehicleFleetFilter(filters: FleetOperationsFilters): { vehicle: { fleetId: string } } | Record<string, never> {
    return filters.fleetId ? { vehicle: { fleetId: filters.fleetId } } : {};
  }

  private dateRangeFilter(filters: FleetOperationsFilters): Prisma.DateTimeFilter | undefined {
    if (!filters.startDate && !filters.endDate) return undefined;
    return compact({ gte: filters.startDate, lte: filters.endDate });
  }

  // Piso fixo dos ultimos MONTHLY_TREND_MONTHS meses -- usado pelos graficos
  // de evolucao mensal, que SEMPRE cobrem essa janela (ignoram startDate/
  // endDate do filtro), mesmo padrao de DashboardService.getCharts.
  private trendDateRange(): Prisma.DateTimeFilter {
    const floor = new Date();
    floor.setUTCMonth(floor.getUTCMonth() - (MONTHLY_TREND_MONTHS - 1), 1);
    floor.setUTCHours(0, 0, 0, 0);
    return { gte: floor };
  }

  private toFuelQuery(filters: FleetOperationsFilters): FindFuelSuppliesQueryDto {
    const query = new FindFuelSuppliesQueryDto();
    if (filters.vehicleId) query.vehicleId = filters.vehicleId;
    if (filters.startDate) query.supplyDateFrom = filters.startDate.toISOString();
    if (filters.endDate) query.supplyDateTo = filters.endDate.toISOString();
    return query;
  }

  private toCostCategory(category: string, amount: number): FleetCostCategoryEntity {
    const entity = new FleetCostCategoryEntity();
    entity.category = category;
    entity.amount = amount;
    return entity;
  }

  // 1 query em lote para buscar as placas de um conjunto arbitrario de
  // veiculos (rankings top-N ou o universo completo usado pelos alertas) --
  // nunca 1 query por veiculo.
  private async buildPlateMap(vehicleIds: string[]): Promise<Map<string, string>> {
    if (vehicleIds.length === 0) return new Map();
    const vehicles = await this.prisma.vehicle.findMany({
      where: { id: { in: vehicleIds } },
      select: { id: true, plate: true },
    });
    return new Map(vehicles.map((v) => [v.id, v.plate]));
  }

  private async attachPlates(
    ranking: { vehicleId: string; value: number; count: number }[],
  ): Promise<FleetVehicleRankingEntryEntity[]> {
    if (ranking.length === 0) return [];

    const plateById = await this.buildPlateMap(ranking.map((entry) => entry.vehicleId));

    return ranking.map((entry) => {
      const entity = new FleetVehicleRankingEntryEntity();
      entity.vehicleId = entry.vehicleId;
      entity.plate = plateById.get(entry.vehicleId) ?? '—';
      entity.value = entry.value;
      entity.count = entry.count;
      return entity;
    });
  }

  private buildVehicleWhere(tenantId: string, filters: FleetOperationsFilters): Prisma.VehicleWhereInput {
    return { tenantId, deletedAt: null, ...compact({ id: filters.vehicleId, fleetId: filters.fleetId }) };
  }

  // Trip nao tem vehicleId/fleetId diretos -- sempre via composition (mesmo
  // padrao ja usado por DashboardService.buildTripWhere). dateRange
  // aplicado sobre createdAt quando informado (undefined = contagem de
  // estado atual, sem filtro de data).
  private buildTripWhere(
    tenantId: string,
    filters: FleetOperationsFilters,
    dateRange: Prisma.DateTimeFilter | undefined,
  ): Prisma.TripWhereInput {
    const compositionFilter = compact({
      vehicleId: filters.vehicleId,
      vehicle: filters.fleetId ? { fleetId: filters.fleetId } : undefined,
    });
    return {
      tenantId,
      deletedAt: null,
      ...compact({
        composition: Object.keys(compositionFilter).length > 0 ? compositionFilter : undefined,
        createdAt: dateRange,
      }),
    };
  }

  private buildTripMetricsWhere(tenantId: string, filters: FleetOperationsFilters): Prisma.TripMetricsWhereInput {
    return { tenantId, trip: this.buildTripWhere(tenantId, filters, this.dateRangeFilter(filters)) };
  }

  private buildFuelWhere(
    tenantId: string,
    filters: FleetOperationsFilters,
    dateRange: Prisma.DateTimeFilter | undefined,
  ): Prisma.FuelSupplyWhereInput {
    return {
      tenantId,
      ...compact({ vehicleId: filters.vehicleId, supplyDate: dateRange }),
      ...this.vehicleFleetFilter(filters),
    };
  }

  private buildMaintenanceWhere(
    tenantId: string,
    filters: FleetOperationsFilters,
    dateRange: Prisma.DateTimeFilter | undefined,
  ): Prisma.VehicleMaintenanceWhereInput {
    return {
      tenantId,
      ...compact({ vehicleId: filters.vehicleId, openedAt: dateRange }),
      ...this.vehicleFleetFilter(filters),
    };
  }

  private buildTireWhere(
    tenantId: string,
    filters: FleetOperationsFilters,
    dateRange: Prisma.DateTimeFilter | undefined,
  ): Prisma.TireWhereInput {
    return {
      tenantId,
      ...compact({ vehicleId: filters.vehicleId, purchaseDate: dateRange }),
      ...this.vehicleFleetFilter(filters),
    };
  }

  // TireRetread nao tem vehicleId direto -- so filtro de tenant/periodo
  // (custo total continua correto; atribuicao por veiculo fica de fora do
  // ranking, ver comentario em getCosts).
  private buildTireRetreadWhere(
    tenantId: string,
    filters: FleetOperationsFilters,
    dateRange: Prisma.DateTimeFilter | undefined,
  ): Prisma.TireRetreadWhereInput {
    return {
      tire: {
        tenantId,
        ...compact({ vehicleId: filters.vehicleId }),
        ...(filters.fleetId ? { vehicle: { fleetId: filters.fleetId } } : {}),
      },
      ...compact({ retreadDate: dateRange }),
    };
  }

  private buildTollWhere(
    tenantId: string,
    filters: FleetOperationsFilters,
    dateRange: Prisma.DateTimeFilter | undefined,
  ): Prisma.TollTransactionWhereInput {
    return {
      tenantId,
      ...compact({ vehicleId: filters.vehicleId, chargedAt: dateRange }),
      ...this.vehicleFleetFilter(filters),
    };
  }

  private buildOtherExpenseWhere(
    tenantId: string,
    filters: FleetOperationsFilters,
    dateRange: Prisma.DateTimeFilter | undefined,
  ): Prisma.TripExpenseWhereInput {
    return {
      tenantId,
      status: ExpenseStatus.APPROVED,
      category: { notIn: EXPENSE_CATEGORIES_WITH_PRIMARY_SOURCE },
      ...compact({ vehicleId: filters.vehicleId, expenseDate: dateRange }),
      ...this.vehicleFleetFilter(filters),
    };
  }

  private buildStopWhere(
    tenantId: string,
    filters: FleetOperationsFilters,
    dateRange: Prisma.DateTimeFilter | undefined,
  ): Prisma.TripStopWhereInput {
    return {
      tenantId,
      ...compact({ vehicleId: filters.vehicleId, startedAt: dateRange }),
      ...this.vehicleFleetFilter(filters),
    };
  }
}
