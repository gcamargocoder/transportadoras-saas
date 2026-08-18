import { Injectable } from '@nestjs/common';
import {
  ChecklistExecutionStatus,
  ExpenseCategory,
  ExpenseStatus,
  MaintenanceComponent,
  Prisma,
  RevenueCategory,
  TireStatus,
  TrailerType,
  TripStatus,
  TripStopType,
  VehicleFuelType,
  VehicleMaintenancePriority,
  VehicleMaintenanceStatus,
  VehicleMaintenanceType,
  VehicleOwnershipType,
  VehicleStatus,
  VehicleType,
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
import { NEAR_REPLACEMENT_THRESHOLD_MM, TiresService } from '../../tires/services/tires.service';
import { TripStopStatus } from '../../trip-operations/entities/trip-stop.entity';
import {
  CONSUMPTION_OUTLIER_MULTIPLIER,
  COST_OUTLIER_MULTIPLIER,
  DOWNTIME_COST_OUTLIER_MULTIPLIER,
  EXCESSIVE_BREAKDOWN_MULTIPLIER,
  EXCESSIVE_DOWNTIME_MULTIPLIER,
  LONG_STOP_DURATION_ALERTS_LIMIT,
  MAINTENANCE_COUNT_OUTLIER_MULTIPLIER,
  MAINTENANCE_HIGH_COST_MULTIPLIER,
  MAINTENANCE_PLAN_ALERTS_LIMIT,
  MIN_SUPPLIES_FOR_CONSUMPTION,
  MIN_TRIPS_FOR_REVENUE_RATE,
  PRICE_PER_LITER_OUTLIER_MULTIPLIER,
  STALLED_STOP_MINUTES,
  STOP_TIME_OUTLIER_MULTIPLIER,
  SUPPLY_VOLUME_OUTLIER_MULTIPLIER,
} from '../constants/fleet-operations-alerts.constants';
import { FleetOperationsQueryDto } from '../dto/fleet-operations-query.dto';
import { FleetAlertEntity, FleetAlertSeverity, FleetAlertType } from '../entities/fleet-alert.entity';
import { FleetChecklistSummaryEntity } from '../entities/fleet-checklist-summary.entity';
import {
  FleetAxleCategoryBreakdownEntity,
  FleetCompositionsOverviewEntity,
  FleetTrailerDowntimeEntity,
  FleetTrailerRankingEntryEntity,
  FleetTrailerTypeBreakdownEntity,
} from '../entities/fleet-compositions-overview.entity';
import { FleetCostCategoryEntity, FleetCostFleetEntity, FleetCostsEntity, FleetCostsPreviousPeriodEntity } from '../entities/fleet-costs.entity';
import {
  FleetFinancialCustomerEntity,
  FleetFinancialDashboardEntity,
  FleetFinancialDriverEntity,
  FleetFinancialSummaryEntity,
  FleetFinancialTripRankingEntryEntity,
} from '../entities/fleet-financial-dashboard.entity';
import {
  DOWNTIME_CATEGORIES,
  DowntimeCategory,
  FleetDowntimeCategoryEntity,
  FleetDowntimeCostEntity,
  FleetEstimatedLostRevenueEntity,
  FleetRevenuePerHourEntity,
  FleetVehicleDowntimeCostEntity,
} from '../entities/fleet-downtime-cost.entity';
import {
  FleetFuelAnalyticsEntity,
  FleetFuelCostPerKmEntity,
  FleetFuelConsumptionEntity,
  FleetFuelFleetBreakdownEntity,
  FleetFuelPreviousPeriodEntity,
  FleetFuelRankingsEntity,
  FleetFuelSummaryEntity,
  FleetFuelTankFleetAverageEntity,
  FleetFuelTankLevelEntity,
  FleetFuelVehicleBreakdownEntity,
} from '../entities/fleet-fuel-analytics.entity';
import {
  FleetMaintenanceComponentBreakdownEntity,
  FleetMaintenanceCostPerKmEntity,
  FleetMaintenanceDashboardEntity,
  FleetMaintenancePlanStatusEntity,
} from '../entities/fleet-maintenance-dashboard.entity';
import { FleetOperationalIndicatorsEntity } from '../entities/fleet-operational-indicators.entity';
import { FleetOperationsDashboardEntity } from '../entities/fleet-operations-dashboard.entity';
import { FleetOverviewEntity } from '../entities/fleet-overview.entity';
import { FleetStopDurationAlertEntity, FleetStopsDashboardEntity } from '../entities/fleet-stops-dashboard.entity';
import {
  FleetTireFleetBreakdownEntity,
  FleetTireStatusBreakdownEntity,
  FleetTireWearEntity,
  FleetTiresOverviewEntity,
} from '../entities/fleet-tires-overview.entity';
import { FleetVehicleRankingEntryEntity } from '../entities/fleet-vehicle-ranking-entry.entity';
import {
  FleetVehicleAverageMetricEntity,
  FleetVehicleFleetBreakdownEntity,
  FleetVehicleFuelTypeBreakdownEntity,
  FleetVehicleOwnershipBreakdownEntity,
  FleetVehicleStatusBreakdownEntity,
  FleetVehicleTypeBreakdownEntity,
  FleetVehiclesOverviewEntity,
} from '../entities/fleet-vehicles-overview.entity';
import {
  buildDriverStopRanking,
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
import { getStopDurationThreshold, resolveStopDurationThresholds } from '../utils/stop-duration-thresholds.util';
import { computeRevenuePerHour } from '../utils/downtime-revenue-rate.util';
import { computeMaintenanceCostPerKmTotals } from '../utils/maintenance-cost-per-km.util';
import { evaluateMaintenancePlan } from '../utils/maintenance-plan-status.util';

const ACTIVE_TRIP_STATUSES: TripStatus[] = [TripStatus.IN_PROGRESS, TripStatus.PAUSED];

// OPEN/IN_PROGRESS/WAITING_PARTS = em aberto (mesma divisao ja usada em
// DashboardService, Fase 19). Fase 45 -- completedCount/cancelledCount
// passam a ser contados separadamente (groupBy(['status'])), nunca mais
// somados num unico "encerrada" (CANCELLED nunca deve ser confundido com
// COMPLETED em nenhum indicador).
const OPEN_MAINTENANCE_STATUSES: VehicleMaintenanceStatus[] = [
  VehicleMaintenanceStatus.OPEN,
  VehicleMaintenanceStatus.IN_PROGRESS,
  VehicleMaintenanceStatus.WAITING_PARTS,
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
const TOP_TRIPS_LIMIT = 5;
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
  // Fase 44 -- so consumidos por computeStopsDashboard (ver comentario em
  // FleetOperationsQueryDto).
  driverId?: string;
  type?: TripStopType;
  status?: TripStopStatus;
  vehicleType?: VehicleType;
  vehicleStatus?: VehicleStatus;
  tireStatus?: TireStatus;
  trailerType?: TrailerType;
  // Fase 51 -- so consumidos por computeFinancialDashboard.
  customerId?: string;
  revenueCategory?: RevenueCategory;
  expenseCategory?: ExpenseCategory;
  expenseStatus?: ExpenseStatus;
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
      this.countVehiclesOnTrip(vehicleWhere),
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
    entity.suspendedVehicles = countByStatus.get(VehicleStatus.SUSPENDED) ?? 0;
    entity.maintenanceVehicles = countByStatus.get(VehicleStatus.MAINTENANCE) ?? 0;
    entity.soldVehicles = countByStatus.get(VehicleStatus.SOLD) ?? 0;
    entity.activeTrips = activeTrips;
    entity.vehiclesOnTrip = vehiclesOnTrip;
    entity.vehiclesAvailable = Math.max(activeVehicles - vehiclesOnTrip, 0);
    entity.activeDrivers = activeDrivers;
    entity.openAlerts = openAlerts;
    return entity;
  }

  // Fase 41 -- contagem relacional (sem N+1): veiculos ACTIVE com pelo menos
  // 1 composicao vinculada a uma viagem em andamento agora. Extraida para
  // ser reaproveitada por computeOverview E computeVehiclesOverview (mesma
  // regra, nunca duplicada).
  private countVehiclesOnTrip(vehicleWhere: Prisma.VehicleWhereInput): Promise<number> {
    return this.prisma.vehicle.count({
      where: { ...vehicleWhere, status: VehicleStatus.ACTIVE, tripCompositions: { some: { trip: { status: { in: ACTIVE_TRIP_STATUSES } } } } },
    });
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

  // ==========================================================================
  // FINANCEIRO -- Fase 51. Consolida receitas (TripRevenue) + despesas
  // (TripExpense) + custo REALIZADO completo (reaproveita computeCosts,
  // ja existente, nunca recalculado em paralelo) + adiantamentos
  // (TripAdvance), tudo no MESMO escopo de filtro. "Custo por viagem" nos
  // rankings usa TripExpense aprovado (nao inclui combustivel/pedagio
  // agregados por viagem aqui -- ver GET /trips/:id/financial-dashboard,
  // Fase 51, para o custo completo de 1 viagem especifica).
  // ==========================================================================
  async getFinancialDashboard(tenantId: string, query: FleetOperationsQueryDto): Promise<FleetFinancialDashboardEntity> {
    return this.computeFinancialDashboard(tenantId, this.parseFilters(query));
  }

  private async computeFinancialDashboard(
    tenantId: string,
    filters: FleetOperationsFilters,
  ): Promise<FleetFinancialDashboardEntity> {
    const dateRange = this.dateRangeFilter(filters);
    const expenseStatus = filters.expenseStatus ?? ExpenseStatus.APPROVED;

    const revenueWhere = this.buildRevenueWhere(tenantId, filters, dateRange);
    const expenseWhere = this.buildFinancialExpenseWhere(tenantId, filters, dateRange, expenseStatus);
    const pendingExpenseWhere = this.buildFinancialExpenseWhere(tenantId, filters, dateRange, ExpenseStatus.PENDING);
    const advanceWhere = this.buildAdvanceWhere(tenantId, filters, dateRange);

    const [costsResult, revenueRows, expenseRows, pendingAgg, advanceRows] = await Promise.all([
      this.computeCosts(tenantId, filters),
      this.prisma.tripRevenue.findMany({
        where: revenueWhere,
        select: {
          amount: true,
          receivedAt: true,
          tripId: true,
          customerId: true,
          trip: { select: { composition: { select: { vehicleId: true } } } },
        },
      }),
      this.prisma.tripExpense.findMany({
        where: expenseWhere,
        select: { amount: true, expenseDate: true, tripId: true, vehicleId: true, driverId: true },
      }),
      this.prisma.tripExpense.aggregate({ where: pendingExpenseWhere, _sum: { amount: true } }),
      this.prisma.tripAdvance.findMany({
        where: advanceWhere,
        select: { amount: true, paidAt: true, tripId: true, driverId: true },
      }),
    ]);

    const totalRevenue = revenueRows.reduce((sum, r) => sum + Number(r.amount), 0);
    const totalExpenses = expenseRows.reduce((sum, r) => sum + Number(r.amount), 0);
    const totalAdvances = advanceRows.reduce((sum, r) => sum + Number(r.amount), 0);
    const pendingExpenses = Number(pendingAgg._sum.amount ?? 0);
    const totalCost = costsResult.entity.totalCost;
    const result = totalRevenue - totalCost;

    const summary = new FleetFinancialSummaryEntity();
    summary.totalRevenue = totalRevenue;
    summary.totalExpenses = totalExpenses;
    summary.totalCost = totalCost;
    summary.totalAdvances = totalAdvances;
    summary.pendingExpenses = pendingExpenses;
    summary.result = result;
    summary.marginPercent = totalRevenue > 0 ? (result / totalRevenue) * 100 : null;

    const monthlyRevenue = aggregateMonthlySeries(
      revenueRows.map((r) => ({ date: r.receivedAt, value: Number(r.amount) })),
      MONTHLY_TREND_MONTHS,
    );
    const monthlyExpenses = aggregateMonthlySeries(
      expenseRows.map((r) => ({ date: r.expenseDate, value: Number(r.amount) })),
      MONTHLY_TREND_MONTHS,
    );
    const monthlyResult = monthlyRevenue.map((point, i) => ({
      month: point.month,
      value: Math.round((point.value - (monthlyExpenses[i]?.value ?? 0)) * 100) / 100,
    }));

    const revenueByVehicle = new Map<string, VehicleRankingAccumulator>();
    for (const row of revenueRows) {
      const vehicleId = row.trip?.composition?.vehicleId;
      if (!vehicleId) continue;
      const current = revenueByVehicle.get(vehicleId) ?? { value: 0, count: 0 };
      current.value += Number(row.amount);
      current.count += 1;
      revenueByVehicle.set(vehicleId, current);
    }

    const [topVehiclesByRevenue, revenueByFleet, topVehiclesByExpense] = await Promise.all([
      this.attachPlates(rankTopVehicles(revenueByVehicle, TOP_VEHICLES_LIMIT)),
      this.buildFleetRanking(revenueByVehicle),
      this.attachPlates(rankTopVehicles(costsResult.vehicleMap, TOP_VEHICLES_LIMIT)),
    ]);

    // Ranking por viagem (revenue - expense por tripId). label resolvido em
    // 1 unica query em lote (nunca 1 por viagem).
    const revenueByTrip = new Map<string, number>();
    for (const row of revenueRows) {
      revenueByTrip.set(row.tripId, (revenueByTrip.get(row.tripId) ?? 0) + Number(row.amount));
    }
    const expenseByTrip = new Map<string, number>();
    for (const row of expenseRows) {
      expenseByTrip.set(row.tripId, (expenseByTrip.get(row.tripId) ?? 0) + Number(row.amount));
    }
    const tripIds = new Set([...revenueByTrip.keys(), ...expenseByTrip.keys()]);
    const tripTotals = [...tripIds].map((tripId) => ({
      tripId,
      cost: expenseByTrip.get(tripId) ?? 0,
      result: (revenueByTrip.get(tripId) ?? 0) - (expenseByTrip.get(tripId) ?? 0),
    }));
    const topTripsByCostRaw = [...tripTotals].sort((a, b) => b.cost - a.cost).slice(0, TOP_TRIPS_LIMIT);
    const bestTripsRaw = [...tripTotals].sort((a, b) => b.result - a.result).slice(0, TOP_TRIPS_LIMIT);
    const worstTripsRaw = [...tripTotals].sort((a, b) => a.result - b.result).slice(0, TOP_TRIPS_LIMIT);
    const rankedTripIds = [...new Set([...topTripsByCostRaw, ...bestTripsRaw, ...worstTripsRaw].map((t) => t.tripId))];
    const tripLabels = await this.resolveTripLabels(rankedTripIds);

    const toTripRankingEntity = (tripId: string, value: number): FleetFinancialTripRankingEntryEntity => {
      const entity = new FleetFinancialTripRankingEntryEntity();
      entity.tripId = tripId;
      entity.label = tripLabels.get(tripId) ?? tripId;
      entity.value = Math.round(value * 100) / 100;
      return entity;
    };

    const topTripsByCost = topTripsByCostRaw.map((t) => toTripRankingEntity(t.tripId, t.cost));
    const bestTripsByResult = bestTripsRaw.map((t) => toTripRankingEntity(t.tripId, t.result));
    const worstTripsByResult = worstTripsRaw.map((t) => toTripRankingEntity(t.tripId, t.result));

    // Detalhamento por cliente (TripRevenue.customerId -- campo direto).
    const revenueByCustomerMap = new Map<string | null, number>();
    for (const row of revenueRows) {
      const key = row.customerId ?? null;
      revenueByCustomerMap.set(key, (revenueByCustomerMap.get(key) ?? 0) + Number(row.amount));
    }
    const customerIds = [...revenueByCustomerMap.keys()].filter((id): id is string => id !== null);
    const customers =
      customerIds.length > 0
        ? await this.prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true } })
        : [];
    const customerNameById = new Map(customers.map((c) => [c.id, c.name]));
    const revenueByCustomer = [...revenueByCustomerMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_VEHICLES_LIMIT)
      .map(([customerId, amount]) => {
        const entity = new FleetFinancialCustomerEntity();
        entity.customerId = customerId;
        entity.customerName = customerId ? (customerNameById.get(customerId) ?? '—') : 'Sem cliente';
        entity.amount = amount;
        return entity;
      });

    // Detalhamento por motorista (despesas com driverId direto + adiantamentos).
    const driverExpenseMap = new Map<string, number>();
    for (const row of expenseRows) {
      if (!row.driverId) continue;
      driverExpenseMap.set(row.driverId, (driverExpenseMap.get(row.driverId) ?? 0) + Number(row.amount));
    }
    const driverAdvanceMap = new Map<string, number>();
    for (const row of advanceRows) {
      driverAdvanceMap.set(row.driverId, (driverAdvanceMap.get(row.driverId) ?? 0) + Number(row.amount));
    }
    const driverIds = new Set([...driverExpenseMap.keys(), ...driverAdvanceMap.keys()]);
    const drivers =
      driverIds.size > 0
        ? await this.prisma.driver.findMany({ where: { id: { in: [...driverIds] } }, select: { id: true, name: true } })
        : [];
    const driverNameById = new Map(drivers.map((d) => [d.id, d.name]));
    const byDriver = [...driverIds]
      .map((driverId) => {
        const entity = new FleetFinancialDriverEntity();
        entity.driverId = driverId;
        entity.driverName = driverNameById.get(driverId) ?? '—';
        entity.expenses = driverExpenseMap.get(driverId) ?? 0;
        entity.advances = driverAdvanceMap.get(driverId) ?? 0;
        return entity;
      })
      .sort((a, b) => b.expenses + b.advances - (a.expenses + a.advances))
      .slice(0, TOP_VEHICLES_LIMIT);

    const entity = new FleetFinancialDashboardEntity();
    entity.summary = summary;
    entity.monthlyRevenue = monthlyRevenue;
    entity.monthlyExpenses = monthlyExpenses;
    entity.monthlyResult = monthlyResult;
    entity.topVehiclesByRevenue = topVehiclesByRevenue;
    entity.topVehiclesByExpense = topVehiclesByExpense;
    entity.topExpenseCategories = costsResult.entity.costByCategory;
    entity.topTripsByCost = topTripsByCost;
    entity.bestTripsByResult = bestTripsByResult;
    entity.worstTripsByResult = worstTripsByResult;
    entity.revenueByFleet = revenueByFleet;
    entity.costByFleet = costsResult.entity.costByFleet;
    entity.revenueByCustomer = revenueByCustomer;
    entity.byDriver = byDriver;
    return entity;
  }

  // Filtro de vehicleId/fleetId para TripRevenue/TripAdvance (nenhum dos 2
  // tem vehicleId direto) -- via Trip->TripComposition->Vehicle, mesmo join
  // ja usado por buildTripWhere. driverId so entra aqui quando o model
  // tambem nao tem driverId direto (TripRevenue); TripAdvance ja tem
  // driverId proprio, aplicado fora deste helper.
  private buildVehicleFleetTripJoin(
    filters: FleetOperationsFilters,
    includeDriver: boolean,
  ): Prisma.TripWhereInput | undefined {
    const compositionFilter = compact({
      vehicleId: filters.vehicleId,
      vehicle: filters.fleetId ? { fleetId: filters.fleetId } : undefined,
    });
    const tripFilter = compact({
      driverId: includeDriver ? filters.driverId : undefined,
      composition: Object.keys(compositionFilter).length > 0 ? compositionFilter : undefined,
    });
    return Object.keys(tripFilter).length > 0 ? tripFilter : undefined;
  }

  private buildRevenueWhere(
    tenantId: string,
    filters: FleetOperationsFilters,
    dateRange: Prisma.DateTimeFilter | undefined,
  ): Prisma.TripRevenueWhereInput {
    return {
      tenantId,
      ...compact({
        customerId: filters.customerId,
        category: filters.revenueCategory,
        receivedAt: dateRange,
        trip: this.buildVehicleFleetTripJoin(filters, true),
      }),
    };
  }

  private buildFinancialExpenseWhere(
    tenantId: string,
    filters: FleetOperationsFilters,
    dateRange: Prisma.DateTimeFilter | undefined,
    status: ExpenseStatus,
  ): Prisma.TripExpenseWhereInput {
    return {
      tenantId,
      status,
      ...compact({ vehicleId: filters.vehicleId, category: filters.expenseCategory, expenseDate: dateRange }),
      ...this.vehicleFleetFilter(filters),
      ...(filters.driverId ? { driverId: filters.driverId } : {}),
    };
  }

  private buildAdvanceWhere(
    tenantId: string,
    filters: FleetOperationsFilters,
    dateRange: Prisma.DateTimeFilter | undefined,
  ): Prisma.TripAdvanceWhereInput {
    return {
      tenantId,
      ...compact({
        driverId: filters.driverId,
        paidAt: dateRange,
        trip: this.buildVehicleFleetTripJoin(filters, false),
      }),
    };
  }

  // 1 query em lote para os rotulos ("origem -> destino") das viagens
  // ranqueadas -- nunca 1 query por viagem.
  private async resolveTripLabels(tripIds: string[]): Promise<Map<string, string>> {
    if (tripIds.length === 0) return new Map();
    const trips = await this.prisma.trip.findMany({
      where: { id: { in: tripIds } },
      select: { id: true, origin: { select: { name: true } }, destination: { select: { name: true } } },
    });
    return new Map(trips.map((t) => [t.id, `${t.origin.name} → ${t.destination.name}`]));
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
    const whereAnyStatus = this.buildMaintenanceWhere(tenantId, filters, dateRange, false);

    const [
      statusGroups,
      scheduledCount,
      totalAgg,
      byTypeRaw,
      byPriorityRaw,
      byWorkshopRaw,
      byComponentRaw,
      byVehicleRaw,
      correctiveByVehicleRaw,
      completedDurations,
      costPerKmRows,
      monthlyTrendRows,
      planStatus,
    ] = await Promise.all([
      this.prisma.vehicleMaintenance.groupBy({ by: ['status'], where: whereAnyStatus, _count: true }),
      this.prisma.vehicleMaintenance.count({
        where: { ...where, scheduledAt: { not: null }, status: { in: OPEN_MAINTENANCE_STATUSES } },
      }),
      this.prisma.vehicleMaintenance.aggregate({
        where,
        _sum: { totalCost: true, laborCost: true, partsCost: true, downtimeMinutes: true },
        _count: { totalCost: true, downtimeMinutes: true },
      }),
      this.prisma.vehicleMaintenance.groupBy({ by: ['type'], where, _count: true, _sum: { totalCost: true } }),
      this.prisma.vehicleMaintenance.groupBy({ by: ['priority'], where, _count: true }),
      this.prisma.vehicleMaintenance.groupBy({ by: ['workshop'], where, _count: true, _sum: { totalCost: true } }),
      this.prisma.vehicleMaintenance.groupBy({ by: ['component'], where, _count: true, _sum: { totalCost: true } }),
      this.prisma.vehicleMaintenance.groupBy({
        by: ['vehicleId'],
        where,
        _count: true,
        _sum: { totalCost: true, downtimeMinutes: true },
      }),
      this.prisma.vehicleMaintenance.groupBy({
        by: ['vehicleId'],
        where: { ...where, type: VehicleMaintenanceType.CORRECTIVE },
        _count: true,
      }),
      this.prisma.vehicleMaintenance.findMany({
        where: { ...where, status: VehicleMaintenanceStatus.COMPLETED, completedAt: { not: null } },
        select: { openedAt: true, completedAt: true },
      }),
      this.prisma.vehicleMaintenance.findMany({
        where,
        select: { vehicleId: true, odometerKm: true, totalCost: true },
      }),
      this.prisma.vehicleMaintenance.findMany({
        where: this.buildMaintenanceWhere(tenantId, filters, this.trendDateRange()),
        select: { openedAt: true, totalCost: true },
      }),
      this.computeMaintenancePlanStatus(tenantId, filters),
    ]);

    const countByStatus = new Map(statusGroups.map((row) => [row.status, row._count]));
    const totalCount = [...countByStatus.entries()]
      .filter(([status]) => status !== VehicleMaintenanceStatus.CANCELLED)
      .reduce((sum, [, count]) => sum + count, 0);
    const openCount = OPEN_MAINTENANCE_STATUSES.reduce((sum, status) => sum + (countByStatus.get(status) ?? 0), 0);
    const completedCount = countByStatus.get(VehicleMaintenanceStatus.COMPLETED) ?? 0;
    const cancelledCount = countByStatus.get(VehicleMaintenanceStatus.CANCELLED) ?? 0;
    const preventiveCount = byTypeRaw.find((r) => r.type === VehicleMaintenanceType.PREVENTIVE)?._count ?? 0;
    const correctiveCount = byTypeRaw.find((r) => r.type === VehicleMaintenanceType.CORRECTIVE)?._count ?? 0;

    const totalCost = toNumberOrNull(totalAgg._sum.totalCost) ?? 0;
    const costedCount = totalAgg._count.totalCost;
    const totalDowntimeMinutes = totalAgg._sum.downtimeMinutes;
    const downtimeCount = totalAgg._count.downtimeMinutes;

    const costMap = new Map<string, VehicleRankingAccumulator>();
    mergeVehicleAmounts(costMap, byVehicleRaw, (row) => toNumberOrNull(row._sum.totalCost) ?? 0);
    const downtimeMap = new Map<string, VehicleRankingAccumulator>();
    mergeVehicleAmounts(downtimeMap, byVehicleRaw, (row) => row._sum.downtimeMinutes ?? 0);
    const correctiveCountMap = new Map<string, VehicleRankingAccumulator>();
    mergeVehicleAmounts(correctiveCountMap, correctiveByVehicleRaw, () => 0);

    const costPerKmTotals = computeMaintenanceCostPerKmTotals(
      costPerKmRows.map((r) => ({
        vehicleId: r.vehicleId,
        odometerKm: toNumberOrNull(r.odometerKm),
        totalCost: toNumberOrNull(r.totalCost) ?? 0,
      })),
    );

    const criticalOpenRows = await this.prisma.vehicleMaintenance.findMany({
      where: { ...where, priority: VehicleMaintenancePriority.CRITICAL, status: { in: OPEN_MAINTENANCE_STATUSES } },
      select: { id: true, vehicleId: true, component: true },
      take: ALERTS_LIMIT_PER_TYPE,
    });

    const allVehicleIds = [...new Set([...costMap.keys(), ...downtimeMap.keys(), ...criticalOpenRows.map((r) => r.vehicleId)])];
    const plateById = await this.buildPlateMap(allVehicleIds);

    const [topVehiclesByCost, bottomVehiclesByCost, topVehiclesByCount, topVehiclesByDowntime] = await Promise.all([
      this.attachPlates(rankTopVehicles(costMap, TOP_VEHICLES_LIMIT)),
      this.attachPlates(rankTopVehicles(costMap, TOP_VEHICLES_LIMIT, 'value', 'asc')),
      this.attachPlates(rankTopVehicles(costMap, TOP_VEHICLES_LIMIT, 'count')),
      this.attachPlates(rankTopVehicles(downtimeMap, TOP_VEHICLES_LIMIT)),
    ]);

    const componentCostMap = new Map<string, VehicleRankingAccumulator>();
    for (const row of byComponentRaw) {
      if (!row.component) continue;
      componentCostMap.set(row.component, { value: toNumberOrNull(row._sum.totalCost) ?? 0, count: row._count });
    }
    const topComponentsByCost = this.rankComponents(componentCostMap, TOP_VEHICLES_LIMIT, 'value');
    const topComponentsByCount = this.rankComponents(componentCostMap, TOP_VEHICLES_LIMIT, 'count');

    const maintenanceAlerts = this.computeMaintenanceOutlierAlerts(
      costMap,
      downtimeMap,
      correctiveCountMap,
      criticalOpenRows,
      plateById,
      planStatus,
    );

    const entity = new FleetMaintenanceDashboardEntity();
    entity.totalCount = totalCount;
    entity.openCount = openCount;
    entity.completedCount = completedCount;
    entity.cancelledCount = cancelledCount;
    entity.scheduledCount = scheduledCount;
    entity.preventiveCount = preventiveCount;
    entity.correctiveCount = correctiveCount;
    entity.totalCost = totalCost;
    entity.laborCostTotal = toNumberOrNull(totalAgg._sum.laborCost) ?? 0;
    entity.partsCostTotal = toNumberOrNull(totalAgg._sum.partsCost) ?? 0;
    entity.averageCostPerOccurrence = safeAverage(totalCost, costedCount);
    entity.averageDurationHours = computeAverageDurationHours(completedDurations);
    entity.totalDowntimeMinutes = downtimeCount > 0 ? totalDowntimeMinutes : null;
    entity.averageDowntimeMinutes = safeAverage(totalDowntimeMinutes ?? 0, downtimeCount);
    entity.costPerKm = this.buildMaintenanceCostPerKmEntity(costPerKmTotals);
    entity.overdueCount = planStatus.overdue.length;
    entity.dueSoonCount = planStatus.dueSoon.length;
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
    entity.byComponent = byComponentRaw.map((row) => ({
      component: row.component,
      count: row._count,
      cost: toNumberOrNull(row._sum.totalCost) ?? 0,
    }));
    entity.topVehiclesByCost = topVehiclesByCost;
    entity.bottomVehiclesByCost = bottomVehiclesByCost;
    entity.topVehiclesByCount = topVehiclesByCount;
    entity.topVehiclesByDowntime = topVehiclesByDowntime;
    entity.topComponentsByCost = topComponentsByCost;
    entity.topComponentsByCount = topComponentsByCount;
    entity.overdueMaintenances = planStatus.overdue;
    entity.upcomingMaintenances = planStatus.dueSoon;
    entity.maintenanceAlerts = maintenanceAlerts;
    entity.monthlyTrend = aggregateMonthlySeries(
      monthlyTrendRows.map((r) => ({ date: r.openedAt, value: toNumberOrNull(r.totalCost) ?? 0 })),
      MONTHLY_TREND_MONTHS,
    );
    return { entity, vehicleMap: costMap };
  }

  private buildMaintenanceCostPerKmEntity(totals: { totalCost: number; totalDistanceKm: number } | null): FleetMaintenanceCostPerKmEntity {
    const entity = new FleetMaintenanceCostPerKmEntity();
    if (!totals || totals.totalDistanceKm <= 0) {
      entity.value = null;
      entity.available = false;
      entity.reason = 'INSUFFICIENT_ODOMETER_READINGS';
      return entity;
    }
    entity.value = totals.totalCost / totals.totalDistanceKm;
    entity.available = true;
    entity.reason = null;
    return entity;
  }

  // Fase 45 -- ranking de componentes (secao "Rankings" do pedido) --
  // mesma logica de rankTopVehicles, mas chave e um MaintenanceComponent,
  // nunca um vehicleId -- reimplementado localmente (pequeno demais para
  // justificar generalizar rankTopVehicles).
  private rankComponents(
    merged: Map<string, VehicleRankingAccumulator>,
    limit: number,
    sortBy: 'value' | 'count',
  ): FleetMaintenanceComponentBreakdownEntity[] {
    return [...merged.entries()]
      .sort((a, b) => b[1][sortBy] - a[1][sortBy])
      .slice(0, limit)
      .map(([component, agg]) => ({
        component: component as MaintenanceComponent,
        count: agg.count,
        cost: agg.value,
      }));
  }

  // Fase 45 -- planos de manutencao preventiva: vencidos/proximos. Le
  // MaintenancePlan + a ultima VehicleMaintenance COMPLETED vinculada a
  // cada plano + Vehicle.odometerKm atual, tudo em lote (3 queries fixas,
  // nunca 1 por plano) -- ver evaluateMaintenancePlan (pura, testada
  // isoladamente).
  private async computeMaintenancePlanStatus(
    tenantId: string,
    filters: FleetOperationsFilters,
  ): Promise<{ overdue: FleetMaintenancePlanStatusEntity[]; dueSoon: FleetMaintenancePlanStatusEntity[] }> {
    const activePlans = await this.prisma.maintenancePlan.findMany({
      where: { tenantId, active: true, ...compact({ vehicleId: filters.vehicleId }), ...this.vehicleFleetFilter(filters) },
    });
    if (activePlans.length === 0) return { overdue: [], dueSoon: [] };

    const planIds = activePlans.map((p) => p.id);
    const vehicleIds = [...new Set(activePlans.map((p) => p.vehicleId))];

    const [lastCompletedRows, vehicles] = await Promise.all([
      this.prisma.vehicleMaintenance.findMany({
        where: { tenantId, maintenancePlanId: { in: planIds }, status: VehicleMaintenanceStatus.COMPLETED },
        select: { maintenancePlanId: true, completedAt: true, odometerKm: true },
        orderBy: { completedAt: 'desc' },
      }),
      this.prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, plate: true, odometerKm: true } }),
    ]);

    // Primeira ocorrencia por plano = a mais recente (rows ja vieram
    // ordenadas desc por completedAt).
    const lastByPlan = new Map<string, { completedAt: Date | null; odometerKm: number | null }>();
    for (const row of lastCompletedRows) {
      if (!row.maintenancePlanId || lastByPlan.has(row.maintenancePlanId)) continue;
      lastByPlan.set(row.maintenancePlanId, { completedAt: row.completedAt, odometerKm: toNumberOrNull(row.odometerKm) });
    }
    const vehicleById = new Map(vehicles.map((v) => [v.id, { plate: v.plate, odometerKm: toNumberOrNull(v.odometerKm) }]));

    const now = new Date();
    const overdue: FleetMaintenancePlanStatusEntity[] = [];
    const dueSoon: FleetMaintenancePlanStatusEntity[] = [];

    for (const plan of activePlans) {
      const lastService = lastByPlan.get(plan.id) ?? null;
      const vehicleInfo = vehicleById.get(plan.vehicleId);
      const evaluation = evaluateMaintenancePlan(
        { intervalKm: plan.intervalKm, intervalDays: plan.intervalDays, alertBeforeKm: plan.alertBeforeKm, alertBeforeDays: plan.alertBeforeDays },
        lastService,
        vehicleInfo?.odometerKm ?? null,
        now,
      );
      if (evaluation.status !== 'OVERDUE' && evaluation.status !== 'DUE_SOON') continue;

      const statusEntity = new FleetMaintenancePlanStatusEntity();
      statusEntity.planId = plan.id;
      statusEntity.vehicleId = plan.vehicleId;
      statusEntity.vehiclePlate = vehicleInfo?.plate ?? '—';
      statusEntity.name = plan.name;
      statusEntity.component = plan.component;
      statusEntity.dueOdometerKm = evaluation.dueOdometerKm;
      statusEntity.dueDate = evaluation.dueDate;
      statusEntity.overdueByKm = evaluation.overdueByKm;
      statusEntity.overdueByDays = evaluation.overdueByDays;

      if (evaluation.status === 'OVERDUE') overdue.push(statusEntity);
      else dueSoon.push(statusEntity);
    }

    overdue.sort((a, b) => (b.overdueByDays ?? 0) - (a.overdueByDays ?? 0) || (b.overdueByKm ?? 0) - (a.overdueByKm ?? 0));
    return { overdue: overdue.slice(0, MAINTENANCE_PLAN_ALERTS_LIMIT), dueSoon: dueSoon.slice(0, MAINTENANCE_PLAN_ALERTS_LIMIT) };
  }

  // Fase 45 -- secao "Alertas" do pedido: HIGH_COST/EXCESSIVE_BREAKDOWN/
  // EXCESSIVE_DOWNTIME (outliers por veiculo, mesmo padrao pushOutlierAlerts
  // ja usado pelos demais dominios) + CRITICAL_COMPONENT (manutencao
  // CRITICAL ainda aberta -- flag direta, sem multiplicador) +
  // MAINTENANCE_OVERDUE/DUE_SOON (a partir de planStatus, ja calculado).
  private computeMaintenanceOutlierAlerts(
    costMap: Map<string, VehicleRankingAccumulator>,
    downtimeMap: Map<string, VehicleRankingAccumulator>,
    correctiveCountMap: Map<string, VehicleRankingAccumulator>,
    criticalOpenRows: { id: string; vehicleId: string; component: MaintenanceComponent | null }[],
    plateById: Map<string, string>,
    planStatus: { overdue: FleetMaintenancePlanStatusEntity[]; dueSoon: FleetMaintenancePlanStatusEntity[] },
  ): FleetAlertEntity[] {
    const alerts: FleetAlertEntity[] = [];

    for (const plan of planStatus.overdue.slice(0, ALERTS_LIMIT_PER_TYPE)) {
      const detail = plan.overdueByDays !== null ? `${plan.overdueByDays} dia(s)` : `${plan.overdueByKm} km`;
      alerts.push(
        this.buildAlert(
          'MAINTENANCE_OVERDUE',
          'CRITICAL',
          plan.vehicleId,
          new Map([[plan.vehicleId, plan.vehiclePlate]]),
          `${plan.name} (${plan.component}) vencida ha ${detail}.`,
          plan.overdueByDays ?? plan.overdueByKm,
        ),
      );
    }
    for (const plan of planStatus.dueSoon.slice(0, ALERTS_LIMIT_PER_TYPE)) {
      alerts.push(
        this.buildAlert(
          'MAINTENANCE_DUE_SOON',
          'ATTENTION',
          plan.vehicleId,
          new Map([[plan.vehicleId, plan.vehiclePlate]]),
          `${plan.name} (${plan.component}) proxima do vencimento.`,
          null,
        ),
      );
    }

    const costAverage = safeAverage([...costMap.values()].reduce((sum, v) => sum + v.value, 0), costMap.size) ?? 0;
    this.pushOutlierAlerts(alerts, costMap, plateById, costAverage, MAINTENANCE_HIGH_COST_MULTIPLIER, 'HIGH_COST', 'ATTENTION', (value) =>
      `Custo de manutencao (${this.formatBrl(value)}) acima da media da frota.`,
    );

    const breakdownAverage =
      safeAverage([...correctiveCountMap.values()].reduce((sum, v) => sum + v.count, 0), correctiveCountMap.size) ?? 0;
    this.pushOutlierAlerts(
      alerts,
      correctiveCountMap,
      plateById,
      breakdownAverage,
      EXCESSIVE_BREAKDOWN_MULTIPLIER,
      'EXCESSIVE_BREAKDOWN',
      'ATTENTION',
      (value) => `${value} manutencoes corretivas no periodo -- acima da media da frota.`,
      'count',
    );

    const downtimeAverage = safeAverage([...downtimeMap.values()].reduce((sum, v) => sum + v.value, 0), downtimeMap.size) ?? 0;
    this.pushOutlierAlerts(
      alerts,
      downtimeMap,
      plateById,
      downtimeAverage,
      EXCESSIVE_DOWNTIME_MULTIPLIER,
      'EXCESSIVE_DOWNTIME',
      'ATTENTION',
      (value) => `${Math.round(value)} minutos parado no periodo -- acima da media da frota.`,
    );

    let criticalCount = 0;
    for (const row of criticalOpenRows) {
      if (criticalCount >= ALERTS_LIMIT_PER_TYPE) break;
      alerts.push(
        this.buildAlert(
          'CRITICAL_COMPONENT',
          'CRITICAL',
          row.vehicleId,
          plateById,
          row.component ? `Manutencao CRITICA em aberto no componente ${row.component}.` : 'Manutencao CRITICA em aberto.',
          null,
        ),
      );
      criticalCount += 1;
    }

    return alerts;
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

    const [totalAgg, byTypeRaw, byVehicleRaw, byDriverRaw, monthlyTrendRows, tenantSettings] = await Promise.all([
      this.prisma.tripStop.aggregate({
        where,
        _count: true,
        _sum: { durationMinutes: true },
        _max: { durationMinutes: true },
        _min: { durationMinutes: true },
      }),
      this.prisma.tripStop.groupBy({ by: ['type'], where, _count: true, _sum: { durationMinutes: true } }),
      this.prisma.tripStop.groupBy({ by: ['vehicleId'], where, _count: true, _sum: { durationMinutes: true } }),
      // Fase 44 -- ranking por motorista (secao 2 do pedido): 1 unica
      // groupBy, mesmo padrao ja usado para veiculo/tipo acima -- nunca 1
      // query por motorista.
      this.prisma.tripStop.groupBy({
        by: ['driverId'],
        where,
        _count: true,
        _sum: { durationMinutes: true },
        _max: { durationMinutes: true },
        _min: { durationMinutes: true },
      }),
      this.prisma.tripStop.findMany({
        where: this.buildStopWhere(tenantId, filters, this.trendDateRange()),
        select: { startedAt: true },
      }),
      // Fase 44 -- limites de duracao por tipo (so `preferences`, nunca a
      // linha inteira de TenantSettings).
      this.prisma.tenantSettings.findUnique({ where: { tenantId }, select: { preferences: true } }),
    ]);

    const totalStops = totalAgg._count;
    const totalDurationMinutes = totalAgg._sum.durationMinutes ?? 0;

    const merged = new Map<string, VehicleRankingAccumulator>();
    mergeVehicleAmounts(merged, byVehicleRaw, (row) => row._sum.durationMinutes ?? 0);

    const driverIds = [...new Set(byDriverRaw.map((r) => r.driverId).filter((id): id is string => id !== null))];
    const [topVehiclesByDuration, driverNameMap, durationAlerts] = await Promise.all([
      this.attachPlates(rankTopVehicles(merged, TOP_VEHICLES_LIMIT)),
      this.buildDriverNameMap(driverIds),
      this.computeStopDurationAlerts(where, resolveStopDurationThresholds(tenantSettings?.preferences)),
    ]);

    const entity = new FleetStopsDashboardEntity();
    entity.totalStops = totalStops;
    entity.totalDurationMinutes = totalDurationMinutes;
    entity.averageDurationMinutes = safeAverage(totalDurationMinutes, totalStops);
    // Fase 43 -- so entre paradas COM duracao calculada (COMPLETED); Prisma
    // ignora nulos automaticamente em _max/_min, entao uma parada OPEN
    // (durationMinutes null) nunca entra nesta conta. null quando nao ha
    // nenhuma parada concluida no escopo (nunca inventa 0).
    entity.maxDurationMinutes = totalAgg._max.durationMinutes ?? null;
    entity.minDurationMinutes = totalAgg._min.durationMinutes ?? null;
    entity.byType = byTypeRaw.map((row) => ({
      type: row.type as TripStopType,
      count: row._count,
      totalDurationMinutes: row._sum.durationMinutes ?? 0,
    }));
    entity.topVehiclesByDuration = topVehiclesByDuration;
    entity.driverRanking = buildDriverStopRanking(byDriverRaw, driverNameMap);
    entity.durationAlerts = durationAlerts;
    entity.monthlyTrend = aggregateMonthlySeries(
      monthlyTrendRows.map((r) => ({ date: r.startedAt, value: 1 })),
      MONTHLY_TREND_MONTHS,
    );
    return { entity, vehicleMap: merged };
  }

  private async buildDriverNameMap(driverIds: string[]): Promise<Map<string, string>> {
    if (driverIds.length === 0) return new Map();
    const drivers = await this.prisma.driver.findMany({ where: { id: { in: driverIds } }, select: { id: true, name: true } });
    return new Map(drivers.map((d) => [d.id, d.name]));
  }

  // Fase 44 -- secao 4/6 do pedido: paradas CONCLUIDAS (nunca aberta/
  // cancelada -- where ja exclui cancelledAt, e o filtro abaixo exige
  // endedAt preenchido) cuja duracao excede o limite configurado (por
  // tenant) para o seu tipo. Pre-filtra pelo MENOR limite configurado (1
  // query, nunca carrega a tabela inteira) e so refina em memoria -- nunca
  // 1 query por parada/tipo. Sem nenhum limite configurado (nem padrao nem
  // tenant), a query nem roda.
  private async computeStopDurationAlerts(
    stopWhere: Prisma.TripStopWhereInput,
    thresholds: Partial<Record<TripStopType, number>>,
  ): Promise<FleetStopDurationAlertEntity[]> {
    const configuredThresholds = Object.values(thresholds).filter((v): v is number => typeof v === 'number');
    if (configuredThresholds.length === 0) return [];
    const minThreshold = Math.min(...configuredThresholds);

    const candidates = await this.prisma.tripStop.findMany({
      where: { ...stopWhere, endedAt: { not: null }, durationMinutes: { gt: minThreshold } },
      select: {
        id: true,
        type: true,
        durationMinutes: true,
        vehicleId: true,
        driverId: true,
        tripId: true,
        startedAt: true,
        endedAt: true,
      },
      orderBy: { durationMinutes: 'desc' },
      take: LONG_STOP_DURATION_ALERTS_LIMIT * 5, // margem antes do filtro por tipo, nunca ilimitado
    });

    const exceeded = candidates
      .map((stop) => {
        const threshold = getStopDurationThreshold(thresholds, stop.type);
        const durationMinutes = stop.durationMinutes ?? 0;
        if (threshold === null || durationMinutes <= threshold) return null;
        return { stop, threshold, excessMinutes: durationMinutes - threshold };
      })
      .filter((row): row is { stop: (typeof candidates)[number]; threshold: number; excessMinutes: number } => row !== null)
      .sort((a, b) => b.excessMinutes - a.excessMinutes)
      .slice(0, LONG_STOP_DURATION_ALERTS_LIMIT);

    if (exceeded.length === 0) return [];

    const vehicleIds = [...new Set(exceeded.map((r) => r.stop.vehicleId))];
    const driverIds = [...new Set(exceeded.map((r) => r.stop.driverId).filter((id): id is string => id !== null))];
    const tripIds = [...new Set(exceeded.map((r) => r.stop.tripId).filter((id): id is string => id !== null))];

    const [plateById, driverNameById, trips] = await Promise.all([
      this.buildPlateMap(vehicleIds),
      this.buildDriverNameMap(driverIds),
      tripIds.length > 0
        ? this.prisma.trip.findMany({
            where: { id: { in: tripIds } },
            select: { id: true, origin: { select: { name: true } }, destination: { select: { name: true } } },
          })
        : Promise.resolve([]),
    ]);
    const referenceByTripId = new Map(trips.map((t) => [t.id, `${t.origin.name} -> ${t.destination.name}`]));

    return exceeded.map(({ stop, threshold, excessMinutes }) => {
      const entity = new FleetStopDurationAlertEntity();
      entity.stopId = stop.id;
      entity.type = stop.type;
      entity.durationMinutes = stop.durationMinutes ?? 0;
      entity.thresholdMinutes = threshold;
      entity.excessMinutes = excessMinutes;
      entity.vehicleId = stop.vehicleId;
      entity.vehiclePlate = plateById.get(stop.vehicleId) ?? '—';
      entity.driverId = stop.driverId;
      entity.driverName = stop.driverId ? (driverNameById.get(stop.driverId) ?? null) : null;
      entity.tripId = stop.tripId;
      entity.tripReference = stop.tripId ? (referenceByTripId.get(stop.tripId) ?? null) : null;
      entity.startedAt = stop.startedAt;
      entity.endedAt = stop.endedAt as Date;
      entity.status = 'COMPLETED';
      return entity;
    });
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

    const [rows, monthlyTrendRows, tankLevelsResult] = await Promise.all([
      this.prisma.fuelSupply.findMany({
        where,
        select: { id: true, vehicleId: true, supplyDate: true, odometerKm: true, liters: true, totalAmount: true },
      }),
      this.prisma.fuelSupply.findMany({
        where: this.buildFuelWhere(tenantId, filters, this.trendDateRange()),
        select: { supplyDate: true, totalAmount: true, liters: true },
      }),
      this.computeTankLevels(tenantId, filters),
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
    entity.tankLevels = tankLevelsResult.tankLevels;
    entity.tankFleetAverage = tankLevelsResult.tankFleetAverage;
    return entity;
  }

  // Iteracao de redesign visual -- nivel de tanque ESTIMADO por veiculo.
  // Sempre "estado atual": ignora startDate/endDate (mesmo principio de
  // monthlyTrendCost), so respeita vehicleId/fleetId. Duas queries no
  // total, nenhuma por veiculo:
  //   1) veiculos ativos no escopo com os campos necessarios;
  //   2) ultimo abastecimento de cada veiculo em UMA query, via
  //      distinct(['vehicleId']) + orderBy(supplyDate desc) -- o Prisma
  //      retorna a primeira linha (mais recente) por grupo distinto.
  private async computeTankLevels(
    tenantId: string,
    filters: FleetOperationsFilters,
  ): Promise<{ tankLevels: FleetFuelTankLevelEntity[]; tankFleetAverage: FleetFuelTankFleetAverageEntity }> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        tenantId,
        status: VehicleStatus.ACTIVE,
        deletedAt: null,
        ...compact({ id: filters.vehicleId, fleetId: filters.fleetId }),
      },
      select: { id: true, plate: true, tankCapacityLiters: true, averageConsumptionKmL: true, odometerKm: true },
    });

    const vehicleIds = vehicles.map((v) => v.id);
    const lastSupplies =
      vehicleIds.length > 0
        ? await this.prisma.fuelSupply.findMany({
            where: { tenantId, vehicleId: { in: vehicleIds } },
            distinct: ['vehicleId'],
            orderBy: { supplyDate: 'desc' },
            select: { vehicleId: true, supplyDate: true, odometerKm: true },
          })
        : [];
    const lastSupplyByVehicle = new Map(lastSupplies.map((s) => [s.vehicleId, s]));

    const tankLevels: FleetFuelTankLevelEntity[] = vehicles.map((vehicle) => {
      const entity = new FleetFuelTankLevelEntity();
      entity.vehicleId = vehicle.id;
      entity.plate = vehicle.plate;
      entity.capacityLiters = toNumberOrNull(vehicle.tankCapacityLiters);

      const capacityLiters = entity.capacityLiters;
      const averageConsumptionKmL = toNumberOrNull(vehicle.averageConsumptionKmL);
      const lastSupply = lastSupplyByVehicle.get(vehicle.id);
      const currentOdometerKm = toNumberOrNull(vehicle.odometerKm);

      if (capacityLiters === null || capacityLiters <= 0) {
        entity.estimatedLevelLiters = null;
        entity.percentage = null;
        entity.available = false;
        entity.reason = 'TANK_CAPACITY_NOT_CONFIGURED';
        entity.lastSupplyAt = lastSupply?.supplyDate.toISOString() ?? null;
        entity.kmSinceLastSupply = null;
        return entity;
      }
      if (!lastSupply) {
        entity.estimatedLevelLiters = null;
        entity.percentage = null;
        entity.available = false;
        entity.reason = 'NO_SUPPLY_RECORDED';
        entity.lastSupplyAt = null;
        entity.kmSinceLastSupply = null;
        return entity;
      }
      if (averageConsumptionKmL === null || averageConsumptionKmL <= 0) {
        entity.estimatedLevelLiters = null;
        entity.percentage = null;
        entity.available = false;
        entity.reason = 'AVERAGE_CONSUMPTION_NOT_CONFIGURED';
        entity.lastSupplyAt = lastSupply.supplyDate.toISOString();
        entity.kmSinceLastSupply = null;
        return entity;
      }
      if (currentOdometerKm === null) {
        entity.estimatedLevelLiters = null;
        entity.percentage = null;
        entity.available = false;
        entity.reason = 'VEHICLE_ODOMETER_NOT_AVAILABLE';
        entity.lastSupplyAt = lastSupply.supplyDate.toISOString();
        entity.kmSinceLastSupply = null;
        return entity;
      }

      const lastSupplyOdometerKm = toNumberOrNull(lastSupply.odometerKm) ?? currentOdometerKm;
      // Odometro atual menor que o do ultimo abastecimento e uma
      // inconsistencia de dados -- tratado como "0 km rodado desde entao"
      // (tanque cheio), nunca como consumo negativo inventado.
      const kmSinceLastSupply = Math.max(0, currentOdometerKm - lastSupplyOdometerKm);
      const estimatedLitersConsumed = kmSinceLastSupply / averageConsumptionKmL;
      const estimatedLevelLiters = Math.min(capacityLiters, Math.max(0, capacityLiters - estimatedLitersConsumed));

      entity.estimatedLevelLiters = Math.round(estimatedLevelLiters * 100) / 100;
      entity.percentage = Math.round((estimatedLevelLiters / capacityLiters) * 100);
      entity.available = true;
      entity.reason = null;
      entity.lastSupplyAt = lastSupply.supplyDate.toISOString();
      entity.kmSinceLastSupply = Math.round(kmSinceLastSupply * 100) / 100;
      return entity;
    });

    tankLevels.sort((a, b) => {
      if (a.available && b.available) return (a.percentage ?? 0) - (b.percentage ?? 0);
      if (a.available !== b.available) return a.available ? -1 : 1;
      return a.plate.localeCompare(b.plate);
    });

    const available = tankLevels.filter((t) => t.available && t.percentage !== null);
    const tankFleetAverage = new FleetFuelTankFleetAverageEntity();
    if (available.length === 0) {
      tankFleetAverage.value = null;
      tankFleetAverage.available = false;
      tankFleetAverage.reason = 'NO_VEHICLE_WITH_TANK_DATA';
    } else {
      tankFleetAverage.value = Math.round(available.reduce((sum, t) => sum + (t.percentage ?? 0), 0) / available.length);
      tankFleetAverage.available = true;
      tankFleetAverage.reason = null;
    }

    return { tankLevels, tankFleetAverage };
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
          // Fase 43 -- uma parada cancelada enquanto aberta (correcao
          // administrativa) nao e mais uma parada "em aberto" de verdade;
          // nunca deve gerar o alerta de veiculo parado ha muito tempo.
          cancelledAt: null,
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
      driverId: query.driverId,
      type: query.type,
      status: query.status,
      vehicleType: query.vehicleType,
      vehicleStatus: query.vehicleStatus,
      tireStatus: query.tireStatus,
      trailerType: query.trailerType,
      customerId: query.customerId,
      revenueCategory: query.revenueCategory,
      expenseCategory: query.expenseCategory,
      expenseStatus: query.expenseStatus,
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

  // ==========================================================================
  // VEICULOS/FROTA -- composicao da frota (iteracao de redesign visual).
  // Endpoint proprio (GET /fleet-operations/vehicles), distinto do
  // FleetOverviewEntity do dashboard consolidado (que so tem contagem por
  // status): aqui entram tipo/combustivel/frota/idade/odometro. Sem filtro
  // de periodo -- e uma foto do estado ATUAL da frota, nunca uma metrica de
  // periodo (mesmo principio ja usado em monthlyTrendCost/tankLevels).
  // Sempre 1 unica query de veiculos no escopo (select minimo) + resolucao
  // de frotas em lote -- nunca 1 query por veiculo/tipo/frota.
  // ==========================================================================
  async getVehiclesOverview(tenantId: string, query: FleetOperationsQueryDto): Promise<FleetVehiclesOverviewEntity> {
    return this.computeVehiclesOverview(tenantId, this.parseFilters(query));
  }

  private buildVehiclesOverviewWhere(tenantId: string, filters: FleetOperationsFilters): Prisma.VehicleWhereInput {
    return { ...this.buildVehicleWhere(tenantId, filters), ...compact({ type: filters.vehicleType, status: filters.vehicleStatus }) };
  }

  private async computeVehiclesOverview(tenantId: string, filters: FleetOperationsFilters): Promise<FleetVehiclesOverviewEntity> {
    const vehicleWhere = this.buildVehiclesOverviewWhere(tenantId, filters);

    const [vehicles, vehiclesOnTrip] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: vehicleWhere,
        select: {
          id: true,
          plate: true,
          type: true,
          status: true,
          ownershipType: true,
          fuelType: true,
          fleetId: true,
          manufactureYear: true,
          odometerKm: true,
        },
      }),
      this.countVehiclesOnTrip(vehicleWhere),
    ]);

    const fleetIds = [...new Set(vehicles.map((v) => v.fleetId).filter((id): id is string => id !== null))];
    const fleets = fleetIds.length > 0 ? await this.prisma.fleet.findMany({ where: { id: { in: fleetIds } }, select: { id: true, name: true } }) : [];
    const fleetNameById = new Map(fleets.map((f) => [f.id, f.name]));
    const fleetName = (fleetId: string | null): string => (fleetId ? (fleetNameById.get(fleetId) ?? '—') : 'Sem frota');
    const plateById = new Map(vehicles.map((v) => [v.id, v.plate]));

    const countByStatus = new Map<VehicleStatus, number>();
    const countByType = new Map<VehicleType, number>();
    const countByOwnershipType = new Map<VehicleOwnershipType, number>();
    const countByFuelType = new Map<VehicleFuelType | null, number>();
    const countByFleet = new Map<string | null, number>();
    let ageSum = 0;
    let ageCount = 0;
    let odometerSum = 0;
    let odometerCount = 0;
    const yearMap = new Map<string, VehicleRankingAccumulator>();
    const odometerMap = new Map<string, VehicleRankingAccumulator>();
    const currentYear = new Date().getFullYear();

    for (const v of vehicles) {
      countByStatus.set(v.status, (countByStatus.get(v.status) ?? 0) + 1);
      countByType.set(v.type, (countByType.get(v.type) ?? 0) + 1);
      countByOwnershipType.set(v.ownershipType, (countByOwnershipType.get(v.ownershipType) ?? 0) + 1);
      countByFuelType.set(v.fuelType, (countByFuelType.get(v.fuelType) ?? 0) + 1);
      countByFleet.set(v.fleetId, (countByFleet.get(v.fleetId) ?? 0) + 1);

      if (v.manufactureYear !== null) {
        ageSum += currentYear - v.manufactureYear;
        ageCount += 1;
        yearMap.set(v.id, { value: v.manufactureYear, count: v.manufactureYear });
      }
      const odometerKm = toNumberOrNull(v.odometerKm);
      if (odometerKm !== null) {
        odometerSum += odometerKm;
        odometerCount += 1;
        odometerMap.set(v.id, { value: odometerKm, count: odometerKm });
      }
    }

    const entity = new FleetVehiclesOverviewEntity();
    entity.totalVehicles = vehicles.length;
    entity.activeCount = countByStatus.get(VehicleStatus.ACTIVE) ?? 0;
    entity.inactiveCount = countByStatus.get(VehicleStatus.INACTIVE) ?? 0;
    entity.suspendedCount = countByStatus.get(VehicleStatus.SUSPENDED) ?? 0;
    entity.maintenanceCount = countByStatus.get(VehicleStatus.MAINTENANCE) ?? 0;
    entity.soldCount = countByStatus.get(VehicleStatus.SOLD) ?? 0;
    entity.vehiclesOnTrip = vehiclesOnTrip;
    entity.vehiclesAvailable = Math.max(entity.activeCount - vehiclesOnTrip, 0);

    entity.byType = [...countByType.entries()].map(([type, count]) => {
      const row = new FleetVehicleTypeBreakdownEntity();
      row.type = type;
      row.count = count;
      return row;
    });
    entity.byStatus = [...countByStatus.entries()].map(([status, count]) => {
      const row = new FleetVehicleStatusBreakdownEntity();
      row.status = status;
      row.count = count;
      return row;
    });
    entity.byOwnershipType = [...countByOwnershipType.entries()].map(([ownershipType, count]) => {
      const row = new FleetVehicleOwnershipBreakdownEntity();
      row.ownershipType = ownershipType;
      row.count = count;
      return row;
    });
    entity.byFuelType = [...countByFuelType.entries()].map(([fuelType, count]) => {
      const row = new FleetVehicleFuelTypeBreakdownEntity();
      row.fuelType = fuelType;
      row.count = count;
      return row;
    });
    entity.byFleet = [...countByFleet.entries()].map(([fleetId, count]) => {
      const row = new FleetVehicleFleetBreakdownEntity();
      row.fleetId = fleetId;
      row.fleetName = fleetName(fleetId);
      row.count = count;
      return row;
    });

    entity.averageAgeYears = this.buildAverageMetricEntity(safeAverage(ageSum, ageCount), 'NO_VEHICLE_WITH_MANUFACTURE_YEAR');
    entity.averageOdometerKm = this.buildAverageMetricEntity(safeAverage(odometerSum, odometerCount), 'NO_VEHICLE_WITH_ODOMETER');

    entity.oldestVehicles = this.toRankingEntities(rankTopVehicles(yearMap, TOP_VEHICLES_LIMIT, 'value', 'asc'), plateById);
    entity.newestVehicles = this.toRankingEntities(rankTopVehicles(yearMap, TOP_VEHICLES_LIMIT, 'value', 'desc'), plateById);
    entity.topVehiclesByOdometer = this.toRankingEntities(rankTopVehicles(odometerMap, TOP_VEHICLES_LIMIT, 'value', 'desc'), plateById);

    return entity;
  }

  private buildAverageMetricEntity(value: number | null, reasonWhenUnavailable: string): FleetVehicleAverageMetricEntity {
    const entity = new FleetVehicleAverageMetricEntity();
    entity.value = value;
    entity.available = value !== null;
    entity.reason = value === null ? reasonWhenUnavailable : null;
    return entity;
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

  // Fase 45 -- bug real corrigido: ate a Fase 44, este where NUNCA excluia
  // CANCELLED -- toda a camada de indicadores/rankings (totalCost,
  // byType/byPriority/byWorkshop, topVehiclesByCost/Count, monthlyTrend)
  // contava manutencao cancelada, mesmo principio do bug ja corrigido para
  // TripStop na Fase 44 (buildStopWhere). `excludeCancelled=false` existe
  // so para a query que PRECISA enxergar cancelada (contagem separada de
  // cancelledCount).
  private buildMaintenanceWhere(
    tenantId: string,
    filters: FleetOperationsFilters,
    dateRange: Prisma.DateTimeFilter | undefined,
    excludeCancelled = true,
  ): Prisma.VehicleMaintenanceWhereInput {
    return {
      tenantId,
      ...compact({ vehicleId: filters.vehicleId, openedAt: dateRange }),
      ...this.vehicleFleetFilter(filters),
      ...(excludeCancelled ? { status: { not: VehicleMaintenanceStatus.CANCELLED } } : {}),
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

  // ==========================================================================
  // PNEUS -- dashboard novo (iteracao de redesign visual), distinto de
  // TireDashboardEntity (GET /tires/dashboard, sem filtro nenhum, ver
  // TiresService.getDashboard -- nao alterado, so reaproveitado tal como
  // esta no card "Pneus" do executivo). Aqui entram filtros
  // (vehicleId/fleetId/tireStatus/periodo), breakdown por frota, evolucao
  // mensal, gauge de desgaste por pneu (leitura direta de inspecao, nunca
  // estimado) e ranking de veiculos por custo de pneu.
  // ==========================================================================
  async getTiresOverview(tenantId: string, query: FleetOperationsQueryDto): Promise<FleetTiresOverviewEntity> {
    return this.computeTiresOverview(tenantId, this.parseFilters(query));
  }

  private buildTiresOverviewWhere(tenantId: string, filters: FleetOperationsFilters): Prisma.TireWhereInput {
    return { ...this.buildTireWhere(tenantId, filters, undefined), ...compact({ status: filters.tireStatus }) };
  }

  private async computeTiresOverview(tenantId: string, filters: FleetOperationsFilters): Promise<FleetTiresOverviewEntity> {
    const dateRange = this.dateRangeFilter(filters);
    const overviewWhere = this.buildTiresOverviewWhere(tenantId, filters);

    const [tires, investedAgg, retreadAgg, monthlyTrendCost] = await Promise.all([
      this.prisma.tire.findMany({
        where: overviewWhere,
        select: {
          id: true,
          fireNumber: true,
          status: true,
          vehicleId: true,
          position: true,
          purchasePrice: true,
          expectedLifespanKm: true,
          initialTreadDepthMm: true,
          currentTreadDepthMm: true,
        },
      }),
      this.prisma.tire.aggregate({ where: this.buildTireWhere(tenantId, filters, dateRange), _sum: { purchasePrice: true } }),
      this.prisma.tireRetread.aggregate({ where: this.buildTireRetreadWhere(tenantId, filters, dateRange), _sum: { cost: true } }),
      this.computeTiresMonthlyTrend(tenantId, filters),
    ]);

    const vehicleIds = [...new Set(tires.map((t) => t.vehicleId).filter((id): id is string => id !== null))];
    const vehicles =
      vehicleIds.length > 0 ? await this.prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, plate: true, fleetId: true } }) : [];
    const plateById = new Map(vehicles.map((v) => [v.id, v.plate]));
    const fleetIdByVehicle = new Map(vehicles.map((v) => [v.id, v.fleetId]));
    const fleetIds = [...new Set(vehicles.map((v) => v.fleetId).filter((id): id is string => id !== null))];
    const fleets = fleetIds.length > 0 ? await this.prisma.fleet.findMany({ where: { id: { in: fleetIds } }, select: { id: true, name: true } }) : [];
    const fleetNameById = new Map(fleets.map((f) => [f.id, f.name]));
    const fleetName = (fleetId: string | null): string => (fleetId ? (fleetNameById.get(fleetId) ?? '—') : 'Sem frota');

    const countByStatus = new Map<TireStatus, number>();
    let lifespanSum = 0;
    let lifespanCount = 0;
    let nearReplacementCount = 0;
    const byFleetMap = new Map<string | null, { count: number; cost: number }>();
    const vehicleCostMap = new Map<string, VehicleRankingAccumulator>();
    const tireWear: FleetTireWearEntity[] = [];

    for (const tire of tires) {
      countByStatus.set(tire.status, (countByStatus.get(tire.status) ?? 0) + 1);

      const expectedLifespanKm = toNumberOrNull(tire.expectedLifespanKm);
      if (expectedLifespanKm !== null) {
        lifespanSum += expectedLifespanKm;
        lifespanCount += 1;
      }

      if (tire.vehicleId !== null) {
        const fleetId = fleetIdByVehicle.get(tire.vehicleId) ?? null;
        const purchasePrice = toNumberOrNull(tire.purchasePrice) ?? 0;

        const fleetAgg = byFleetMap.get(fleetId) ?? { count: 0, cost: 0 };
        fleetAgg.count += 1;
        fleetAgg.cost += purchasePrice;
        byFleetMap.set(fleetId, fleetAgg);

        const vehicleAgg = vehicleCostMap.get(tire.vehicleId) ?? { value: 0, count: 0 };
        vehicleAgg.value += purchasePrice;
        vehicleAgg.count += 1;
        vehicleCostMap.set(tire.vehicleId, vehicleAgg);
      }

      if (tire.status === TireStatus.IN_USE) {
        tireWear.push(this.buildTireWearEntity(tire, plateById));
        const currentTreadDepthMm = toNumberOrNull(tire.currentTreadDepthMm);
        if (currentTreadDepthMm !== null && currentTreadDepthMm <= NEAR_REPLACEMENT_THRESHOLD_MM) {
          nearReplacementCount += 1;
        }
      }
    }

    // Disponiveis primeiro, ordenados por desgaste ascendente (mais gasto
    // primeiro); indisponiveis por ultimo, ordem estavel por fireNumber
    // (mesmo criterio de desempate ja usado para tankLevels).
    tireWear.sort((a, b) => {
      if (a.available && b.available) return (a.wearPercentRemaining ?? 0) - (b.wearPercentRemaining ?? 0);
      if (a.available !== b.available) return a.available ? -1 : 1;
      return a.fireNumber.localeCompare(b.fireNumber);
    });

    const entity = new FleetTiresOverviewEntity();
    entity.totalTires = tires.length;
    entity.newCount = countByStatus.get(TireStatus.NEW) ?? 0;
    entity.inUseCount = countByStatus.get(TireStatus.IN_USE) ?? 0;
    entity.stockCount = countByStatus.get(TireStatus.STOCK) ?? 0;
    entity.retreadedCount = countByStatus.get(TireStatus.RETREADED) ?? 0;
    entity.scrappedCount = countByStatus.get(TireStatus.SCRAPPED) ?? 0;
    entity.investedValue = toNumberOrNull(investedAgg._sum.purchasePrice) ?? 0;
    entity.retreadValue = toNumberOrNull(retreadAgg._sum.cost) ?? 0;
    entity.averageLifespanKm = safeAverage(lifespanSum, lifespanCount);
    entity.nearReplacementCount = nearReplacementCount;

    entity.byStatus = [...countByStatus.entries()].map(([status, count]) => {
      const row = new FleetTireStatusBreakdownEntity();
      row.status = status;
      row.count = count;
      return row;
    });
    entity.byFleet = [...byFleetMap.entries()].map(([fleetId, agg]) => {
      const row = new FleetTireFleetBreakdownEntity();
      row.fleetId = fleetId;
      row.fleetName = fleetName(fleetId);
      row.count = agg.count;
      row.cost = agg.cost;
      return row;
    });
    entity.monthlyTrendCost = monthlyTrendCost;
    entity.tireWear = tireWear;
    entity.topVehiclesByTireCost = this.toRankingEntities(rankTopVehicles(vehicleCostMap, TOP_VEHICLES_LIMIT, 'value', 'desc'), plateById);
    entity.tireAlerts = this.computeTireAlerts(tires, plateById);

    return entity;
  }

  private buildTireWearEntity(
    tire: {
      id: string;
      fireNumber: string;
      vehicleId: string | null;
      position: string | null;
      initialTreadDepthMm: Prisma.Decimal | null;
      currentTreadDepthMm: Prisma.Decimal | null;
    },
    plateById: Map<string, string>,
  ): FleetTireWearEntity {
    const entity = new FleetTireWearEntity();
    entity.tireId = tire.id;
    entity.fireNumber = tire.fireNumber;
    entity.vehiclePlate = tire.vehicleId ? (plateById.get(tire.vehicleId) ?? null) : null;
    entity.position = tire.position;

    const initialTreadDepthMm = toNumberOrNull(tire.initialTreadDepthMm);
    const currentTreadDepthMm = toNumberOrNull(tire.currentTreadDepthMm);
    entity.initialTreadDepthMm = initialTreadDepthMm;
    entity.currentTreadDepthMm = currentTreadDepthMm;

    if (initialTreadDepthMm === null || initialTreadDepthMm <= 0) {
      entity.wearPercentRemaining = null;
      entity.available = false;
      entity.reason = 'INITIAL_TREAD_DEPTH_NOT_CONFIGURED';
      return entity;
    }
    if (currentTreadDepthMm === null) {
      entity.wearPercentRemaining = null;
      entity.available = false;
      entity.reason = 'NO_INSPECTION_RECORDED';
      return entity;
    }

    entity.wearPercentRemaining = Math.round(Math.min(100, Math.max(0, (currentTreadDepthMm / initialTreadDepthMm) * 100)));
    entity.available = true;
    entity.reason = null;
    return entity;
  }

  private computeTireAlerts(
    tires: { fireNumber: string; status: TireStatus; vehicleId: string | null; currentTreadDepthMm: Prisma.Decimal | null }[],
    plateById: Map<string, string>,
  ): FleetAlertEntity[] {
    const alerts: FleetAlertEntity[] = [];
    for (const tire of tires) {
      if (alerts.length >= ALERTS_LIMIT_PER_TYPE) break;
      if (tire.status !== TireStatus.IN_USE || !tire.vehicleId) continue;
      const currentTreadDepthMm = toNumberOrNull(tire.currentTreadDepthMm);
      if (currentTreadDepthMm === null || currentTreadDepthMm > NEAR_REPLACEMENT_THRESHOLD_MM) continue;
      alerts.push(
        this.buildAlert(
          'TIRE_NEAR_REPLACEMENT',
          'ATTENTION',
          tire.vehicleId,
          plateById,
          `Pneu ${tire.fireNumber} com ${currentTreadDepthMm.toFixed(1)}mm de sulco -- próximo da troca.`,
          currentTreadDepthMm,
        ),
      );
    }
    return alerts;
  }

  // Mesma metodologia de computeCostsMonthlyTrend, so para as 2 fontes de
  // custo de pneu (compra + recapagem) -- sempre ultimos 12 meses, ignora
  // startDate/endDate.
  private async computeTiresMonthlyTrend(tenantId: string, filters: FleetOperationsFilters): Promise<DashboardChartPointEntity[]> {
    const trendRange = this.trendDateRange();
    const [tireRows, retreadRows] = await Promise.all([
      this.prisma.tire.findMany({ where: this.buildTireWhere(tenantId, filters, trendRange), select: { purchaseDate: true, purchasePrice: true } }),
      this.prisma.tireRetread.findMany({ where: this.buildTireRetreadWhere(tenantId, filters, trendRange), select: { retreadDate: true, cost: true } }),
    ]);
    const rows = [
      ...tireRows.filter((r) => r.purchaseDate !== null).map((r) => ({ date: r.purchaseDate as Date, value: toNumberOrNull(r.purchasePrice) ?? 0 })),
      ...retreadRows.map((r) => ({ date: r.retreadDate, value: toNumberOrNull(r.cost) ?? 0 })),
    ];
    return aggregateMonthlySeries(rows, MONTHLY_TREND_MONTHS);
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

  // Fase 43 -- cancelledAt: null e OBRIGATORIO aqui: uma parada cancelada
  // (registro indevido corrigido pelo admin) nunca pode entrar em
  // indicadores/rankings/alertas (mesma regra ja documentada em
  // TripStopsService.cancel()). Fase 44 acrescenta driverId/type/status
  // (mesmo escopo usado pelo ranking por motorista e pelos alertas de
  // duracao longa -- nunca uma segunda interpretacao de filtro). Pedir
  // status=CANCELLED aqui sempre resulta em 0 linhas (cancelledAt: null E
  // cancelledAt: {not: null} sao mutuamente exclusivos) -- comportamento
  // correto por design: este dashboard nunca mostra dado cancelado.
  private buildStopWhere(
    tenantId: string,
    filters: FleetOperationsFilters,
    dateRange: Prisma.DateTimeFilter | undefined,
  ): Prisma.TripStopWhereInput {
    return {
      tenantId,
      cancelledAt: null,
      ...compact({ vehicleId: filters.vehicleId, driverId: filters.driverId, type: filters.type, startedAt: dateRange }),
      ...this.vehicleFleetFilter(filters),
      ...this.stopStatusFilter(filters.status),
    };
  }

  private stopStatusFilter(status: TripStopStatus | undefined): Prisma.TripStopWhereInput {
    if (status === 'OPEN') return { endedAt: null };
    if (status === 'COMPLETED') return { endedAt: { not: null } };
    if (status === 'CANCELLED') return { cancelledAt: { not: null } };
    return {};
  }

  // ==========================================================================
  // TEMPO PARADO E RECEITA PERDIDA -- dashboard novo. Tempo parado vem
  // SOMENTE de TripStop (buildStopWhere, ja existente, reaproveitado tal
  // como esta -- nunca somado com VehicleMaintenance.downtimeMinutes, que
  // e uma fonte manual e desvinculada; somar as duas contaria a mesma
  // parada real duas vezes). Receita perdida estimada = horas paradas x
  // taxa de receita/hora do PROPRIO veiculo (historico COMPLETO de
  // viagens concluidas, ignora startDate/endDate -- uma taxa nao deve
  // variar conforme o periodo do relatorio, mesmo principio ja usado em
  // tankLevels/computeVehiclesOverview). Nunca R$/km -- Vehicle/
  // TripMetrics.actualDistanceKm nunca e escrito por nenhum service
  // (auditado, ver docs/fleet-operations-dashboard.md).
  // ==========================================================================
  async getDowntimeCost(tenantId: string, query: FleetOperationsQueryDto): Promise<FleetDowntimeCostEntity> {
    return this.computeDowntimeCost(tenantId, this.parseFilters(query));
  }

  private categorizeStopType(type: TripStopType): DowntimeCategory {
    if (type === TripStopType.MAINTENANCE) return 'MAINTENANCE';
    if (type === TripStopType.BREAKDOWN) return 'BREAKDOWN';
    if (type === TripStopType.FUEL) return 'FUEL';
    return 'OTHER';
  }

  private async computeDowntimeCost(tenantId: string, filters: FleetOperationsFilters): Promise<FleetDowntimeCostEntity> {
    const dateRange = this.dateRangeFilter(filters);

    const [stops, monthlyTrendStops, completedTrips] = await Promise.all([
      this.prisma.tripStop.findMany({
        where: { ...this.buildStopWhere(tenantId, filters, dateRange), durationMinutes: { not: null } },
        select: { vehicleId: true, type: true, durationMinutes: true },
      }),
      this.prisma.tripStop.findMany({
        where: { ...this.buildStopWhere(tenantId, filters, this.trendDateRange()), durationMinutes: { not: null } },
        select: { startedAt: true, durationMinutes: true },
      }),
      this.prisma.trip.findMany({
        where: { ...this.buildTripWhere(tenantId, filters, undefined), status: TripStatus.COMPLETED },
        select: { id: true, composition: { select: { vehicleId: true } }, metrics: { select: { actualDurationMin: true } } },
      }),
    ]);

    const tripIds = completedTrips.map((t) => t.id);
    const revenueByTrip =
      tripIds.length > 0
        ? await this.prisma.tripRevenue.groupBy({ by: ['tripId'], where: { tenantId, tripId: { in: tripIds } }, _sum: { amount: true } })
        : [];
    const revenueByTripId = new Map(revenueByTrip.map((r) => [r.tripId, toNumberOrNull(r._sum.amount) ?? 0]));

    // ---- taxa de receita/hora por veiculo (historico completo) ----
    const vehicleTripAgg = new Map<string, { totalRevenue: number; totalDurationMin: number; tripCount: number }>();
    for (const trip of completedTrips) {
      const vehicleId = trip.composition?.vehicleId;
      const actualDurationMin = trip.metrics?.actualDurationMin ?? null;
      if (!vehicleId || actualDurationMin === null) continue;
      const agg = vehicleTripAgg.get(vehicleId) ?? { totalRevenue: 0, totalDurationMin: 0, tripCount: 0 };
      agg.totalRevenue += revenueByTripId.get(trip.id) ?? 0;
      agg.totalDurationMin += actualDurationMin;
      agg.tripCount += 1;
      vehicleTripAgg.set(vehicleId, agg);
    }

    // ---- tempo parado por veiculo x categoria ----
    const vehicleStopAgg = new Map<string, Map<DowntimeCategory, { durationMinutes: number; count: number }>>();
    for (const stop of stops) {
      const durationMinutes = stop.durationMinutes ?? 0;
      const category = this.categorizeStopType(stop.type);
      const byCategory = vehicleStopAgg.get(stop.vehicleId) ?? new Map<DowntimeCategory, { durationMinutes: number; count: number }>();
      const current = byCategory.get(category) ?? { durationMinutes: 0, count: 0 };
      current.durationMinutes += durationMinutes;
      current.count += 1;
      byCategory.set(category, current);
      vehicleStopAgg.set(stop.vehicleId, byCategory);
    }

    const vehicleIds = [...vehicleStopAgg.keys()];
    const vehicleRecords =
      vehicleIds.length > 0 ? await this.prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, plate: true } }) : [];
    const plateById = new Map(vehicleRecords.map((v) => [v.id, v.plate]));

    const vehicles: FleetVehicleDowntimeCostEntity[] = [];
    const lostRevenueMap = new Map<string, VehicleRankingAccumulator>();
    const downtimeMap = new Map<string, VehicleRankingAccumulator>();
    const byCategoryTotals = new Map<DowntimeCategory, { durationMinutes: number; count: number; lostRevenue: number; hasLostRevenue: boolean }>();
    for (const category of DOWNTIME_CATEGORIES) byCategoryTotals.set(category, { durationMinutes: 0, count: 0, lostRevenue: 0, hasLostRevenue: false });

    for (const [vehicleId, byCategory] of vehicleStopAgg) {
      const tripAgg = vehicleTripAgg.get(vehicleId);
      const rate = computeRevenuePerHour(
        tripAgg?.totalRevenue ?? 0,
        tripAgg?.totalDurationMin ?? 0,
        tripAgg?.tripCount ?? 0,
        MIN_TRIPS_FOR_REVENUE_RATE,
      );

      let totalDowntimeMinutes = 0;
      let stopCount = 0;
      const categoryEntities: FleetDowntimeCategoryEntity[] = [];
      for (const category of DOWNTIME_CATEGORIES) {
        const agg = byCategory.get(category) ?? { durationMinutes: 0, count: 0 };
        totalDowntimeMinutes += agg.durationMinutes;
        stopCount += agg.count;

        const categoryEntity = new FleetDowntimeCategoryEntity();
        categoryEntity.category = category;
        categoryEntity.durationMinutes = agg.durationMinutes;
        categoryEntity.count = agg.count;
        categoryEntity.estimatedLostRevenue =
          rate.available && rate.value !== null ? Math.round((agg.durationMinutes / 60) * rate.value * 100) / 100 : null;
        categoryEntities.push(categoryEntity);

        const totals = byCategoryTotals.get(category);
        if (totals) {
          totals.durationMinutes += agg.durationMinutes;
          totals.count += agg.count;
          if (categoryEntity.estimatedLostRevenue !== null) {
            totals.lostRevenue += categoryEntity.estimatedLostRevenue;
            totals.hasLostRevenue = true;
          }
        }
      }

      const entity = new FleetVehicleDowntimeCostEntity();
      entity.vehicleId = vehicleId;
      entity.plate = plateById.get(vehicleId) ?? '—';
      entity.totalDowntimeMinutes = totalDowntimeMinutes;
      entity.stopCount = stopCount;
      entity.byCategory = categoryEntities;

      const revenuePerHour = new FleetRevenuePerHourEntity();
      revenuePerHour.value = rate.value;
      revenuePerHour.available = rate.available;
      revenuePerHour.reason = rate.reason;
      revenuePerHour.basedOnTripCount = tripAgg?.tripCount ?? 0;
      entity.revenuePerHour = revenuePerHour;

      const estimatedLostRevenue = new FleetEstimatedLostRevenueEntity();
      if (rate.available && rate.value !== null) {
        estimatedLostRevenue.value = Math.round((totalDowntimeMinutes / 60) * rate.value * 100) / 100;
        estimatedLostRevenue.available = true;
        estimatedLostRevenue.reason = null;
        lostRevenueMap.set(vehicleId, { value: estimatedLostRevenue.value, count: totalDowntimeMinutes });
      } else {
        estimatedLostRevenue.value = null;
        estimatedLostRevenue.available = false;
        estimatedLostRevenue.reason = rate.reason;
      }
      entity.estimatedLostRevenue = estimatedLostRevenue;

      downtimeMap.set(vehicleId, { value: totalDowntimeMinutes, count: stopCount });
      vehicles.push(entity);
    }

    // Disponiveis primeiro (por receita perdida desc), indisponiveis por
    // ultimo (por tempo parado desc) -- mesmo criterio de desempate
    // determinístico ja usado em tankLevels/tireWear.
    vehicles.sort((a, b) => {
      if (a.estimatedLostRevenue.available && b.estimatedLostRevenue.available) {
        return (b.estimatedLostRevenue.value ?? 0) - (a.estimatedLostRevenue.value ?? 0);
      }
      if (a.estimatedLostRevenue.available !== b.estimatedLostRevenue.available) {
        return a.estimatedLostRevenue.available ? -1 : 1;
      }
      return b.totalDowntimeMinutes - a.totalDowntimeMinutes;
    });

    const entity = new FleetDowntimeCostEntity();
    entity.totalStops = stops.length;
    entity.totalDowntimeMinutes = stops.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);

    const totalEstimatedLostRevenue = new FleetEstimatedLostRevenueEntity();
    const availableVehicles = vehicles.filter((v) => v.estimatedLostRevenue.available);
    if (availableVehicles.length > 0) {
      totalEstimatedLostRevenue.value =
        Math.round(availableVehicles.reduce((sum, v) => sum + (v.estimatedLostRevenue.value ?? 0), 0) * 100) / 100;
      totalEstimatedLostRevenue.available = true;
      totalEstimatedLostRevenue.reason = null;
    } else {
      totalEstimatedLostRevenue.value = null;
      totalEstimatedLostRevenue.available = false;
      totalEstimatedLostRevenue.reason = 'NO_VEHICLE_WITH_REVENUE_RATE';
    }
    entity.totalEstimatedLostRevenue = totalEstimatedLostRevenue;

    entity.byCategory = DOWNTIME_CATEGORIES.map((category) => {
      const totals = byCategoryTotals.get(category);
      const row = new FleetDowntimeCategoryEntity();
      row.category = category;
      row.durationMinutes = totals?.durationMinutes ?? 0;
      row.count = totals?.count ?? 0;
      row.estimatedLostRevenue = totals?.hasLostRevenue ? Math.round(totals.lostRevenue * 100) / 100 : null;
      return row;
    });

    entity.vehicles = vehicles;
    entity.topVehiclesByLostRevenue = this.toRankingEntities(rankTopVehicles(lostRevenueMap, TOP_VEHICLES_LIMIT, 'value', 'desc'), plateById);
    entity.topVehiclesByDowntimeMinutes = this.toRankingEntities(rankTopVehicles(downtimeMap, TOP_VEHICLES_LIMIT, 'value', 'desc'), plateById);
    entity.monthlyTrendDowntimeMinutes = aggregateMonthlySeries(
      monthlyTrendStops.map((s) => ({ date: s.startedAt, value: s.durationMinutes ?? 0 })),
      MONTHLY_TREND_MONTHS,
    );

    const alerts: FleetAlertEntity[] = [];
    const lostRevenueAverage = safeAverage([...lostRevenueMap.values()].reduce((sum, v) => sum + v.value, 0), lostRevenueMap.size) ?? 0;
    this.pushOutlierAlerts(
      alerts,
      lostRevenueMap,
      plateById,
      lostRevenueAverage,
      DOWNTIME_COST_OUTLIER_MULTIPLIER,
      'DOWNTIME_COST_OUTLIER',
      'ATTENTION',
      (value) => `Receita perdida estimada (${this.formatBrl(value)}) acima da media da frota.`,
    );
    entity.downtimeCostAlerts = alerts;

    return entity;
  }

  // ==========================================================================
  // COMPOSICAO -- uso de veiculo+carreta por viagem (dashboard novo).
  // Endpoint proprio (GET /fleet-operations/compositions). Auditoria do
  // schema confirmou 3 limitacoes estruturais, documentadas em
  // docs/fleet-operations-dashboard.md: (1) Trailer nao tem campo de eixo
  // proprio -- eixo e atributo de AxleConfiguration, 1:1 com TripComposition,
  // nunca da carreta isolada; (2) TripStop nao tem trailerId -- atribuicao de
  // parada a carreta so via TripStop.tripId -> Trip.composition.trailers,
  // paradas administrativas sem tripId nunca sao atribuidas a nenhuma
  // carreta; (3) composicao pode ter varias carretas (bitrem/rodotrem) --
  // duracao de parada/uso e atribuida INTEIRA a cada carreta da composicao
  // (nunca dividida, elas se movem juntas como uma unidade fisica real).
  // Sem estimativa de receita perdida por carreta (ratear entre carretas da
  // mesma composicao seria uma alocacao inventada, fora de escopo).
  // ==========================================================================
  async getCompositionsOverview(tenantId: string, query: FleetOperationsQueryDto): Promise<FleetCompositionsOverviewEntity> {
    return this.computeCompositionsOverview(tenantId, this.parseFilters(query));
  }

  private buildTrailerWhere(tenantId: string, filters: FleetOperationsFilters): Prisma.TrailerWhereInput {
    return { tenantId, deletedAt: null, ...compact({ type: filters.trailerType }) };
  }

  private countTrailersOnTrip(trailerWhere: Prisma.TrailerWhereInput): Promise<number> {
    return this.prisma.trailer.count({
      where: {
        ...trailerWhere,
        isActive: true,
        tripCompositionTrailers: { some: { tripComposition: { trip: { status: { in: ACTIVE_TRIP_STATUSES } } } } },
      },
    });
  }

  private async buildTrailerInfoMap(trailerIds: string[]): Promise<Map<string, { plate: string; type: TrailerType }>> {
    if (trailerIds.length === 0) return new Map();
    const trailers = await this.prisma.trailer.findMany({ where: { id: { in: trailerIds } }, select: { id: true, plate: true, type: true } });
    return new Map(trailers.map((t) => [t.id, { plate: t.plate, type: t.type }]));
  }

  private async computeCompositionsOverview(tenantId: string, filters: FleetOperationsFilters): Promise<FleetCompositionsOverviewEntity> {
    const dateRange = this.dateRangeFilter(filters);
    const trailerWhere = this.buildTrailerWhere(tenantId, filters);

    const [trailers, trailersOnTrip, axleTrips, completedTrips, stops, monthlyTrendTrips] = await Promise.all([
      this.prisma.trailer.findMany({ where: trailerWhere, select: { id: true, plate: true, type: true, isActive: true } }),
      this.countTrailersOnTrip(trailerWhere),
      this.prisma.trip.findMany({
        where: this.buildTripWhere(tenantId, filters, dateRange),
        select: { composition: { select: { axleConfiguration: { select: { totalAxles: true, billableCategory: true } } } } },
      }),
      this.prisma.trip.findMany({
        where: { ...this.buildTripWhere(tenantId, filters, undefined), status: TripStatus.COMPLETED },
        select: {
          id: true,
          composition: { select: { trailers: { select: { trailerId: true } } } },
          metrics: { select: { actualDurationMin: true } },
        },
      }),
      this.prisma.tripStop.findMany({
        where: { ...this.buildStopWhere(tenantId, filters, dateRange), tripId: { not: null }, durationMinutes: { not: null } },
        select: { tripId: true, durationMinutes: true },
      }),
      this.prisma.trip.findMany({
        where: { ...this.buildTripWhere(tenantId, filters, this.trendDateRange()), status: TripStatus.COMPLETED },
        select: { createdAt: true, composition: { select: { trailers: { select: { trailerId: true } } } } },
      }),
    ]);

    // ---- estado atual da frota de carretas (ignora periodo) ----
    const byTypeMap = new Map<TrailerType, number>();
    for (const t of trailers) byTypeMap.set(t.type, (byTypeMap.get(t.type) ?? 0) + 1);
    const activeCount = trailers.filter((t) => t.isActive).length;

    // ---- configuracao de eixos das composicoes de viagens no escopo ----
    const axleMap = new Map<string, { totalAxles: number; count: number }>();
    for (const trip of axleTrips) {
      const cfg = trip.composition?.axleConfiguration;
      if (!cfg) continue;
      const current = axleMap.get(cfg.billableCategory) ?? { totalAxles: cfg.totalAxles, count: 0 };
      current.count += 1;
      axleMap.set(cfg.billableCategory, current);
    }

    // ---- tempo em uso por carreta (viagens concluidas, duracao inteira p/ cada carreta da composicao) ----
    const trailerUsageMap = new Map<string, VehicleRankingAccumulator>();
    for (const trip of completedTrips) {
      const trailerIds = trip.composition?.trailers.map((tc) => tc.trailerId) ?? [];
      const actualDurationMin = trip.metrics?.actualDurationMin ?? null;
      if (trailerIds.length === 0 || actualDurationMin === null) continue;
      for (const trailerId of trailerIds) {
        const current = trailerUsageMap.get(trailerId) ?? { value: 0, count: 0 };
        current.value += actualDurationMin;
        current.count += 1;
        trailerUsageMap.set(trailerId, current);
      }
    }

    // ---- tempo parado por carreta (so paradas com tripId -- limitacao 2 acima) ----
    const stopTripIds = [...new Set(stops.map((s) => s.tripId).filter((id): id is string => id !== null))];
    const stopTrips =
      stopTripIds.length > 0
        ? await this.prisma.trip.findMany({
            where: { id: { in: stopTripIds } },
            select: { id: true, composition: { select: { trailers: { select: { trailerId: true } } } } },
          })
        : [];
    const trailerIdsByTripId = new Map(stopTrips.map((t) => [t.id, t.composition?.trailers.map((tc) => tc.trailerId) ?? []]));
    const trailerDowntimeMap = new Map<string, number>();
    for (const stop of stops) {
      if (!stop.tripId) continue;
      const trailerIds = trailerIdsByTripId.get(stop.tripId) ?? [];
      for (const trailerId of trailerIds) {
        trailerDowntimeMap.set(trailerId, (trailerDowntimeMap.get(trailerId) ?? 0) + (stop.durationMinutes ?? 0));
      }
    }

    const trailerIdsInvolved = [...new Set([...trailerUsageMap.keys(), ...trailerDowntimeMap.keys()])];
    const trailerInfoMap = await this.buildTrailerInfoMap(trailerIdsInvolved);

    const toTrailerEntry = (entry: VehicleRankingEntry): FleetTrailerRankingEntryEntity => {
      const info = trailerInfoMap.get(entry.vehicleId);
      const row = new FleetTrailerRankingEntryEntity();
      row.trailerId = entry.vehicleId;
      row.plate = info?.plate ?? '—';
      row.type = info?.type ?? TrailerType.OTHER;
      row.value = entry.value;
      row.count = entry.count;
      return row;
    };

    const entity = new FleetCompositionsOverviewEntity();
    entity.totalTrailers = trailers.length;
    entity.activeCount = activeCount;
    entity.inactiveCount = trailers.length - activeCount;
    entity.trailersOnTrip = trailersOnTrip;
    entity.trailersAvailable = Math.max(activeCount - trailersOnTrip, 0);
    entity.byType = [...byTypeMap.entries()].map(([type, count]) => {
      const row = new FleetTrailerTypeBreakdownEntity();
      row.type = type;
      row.count = count;
      return row;
    });
    entity.axleCategoryBreakdown = [...axleMap.entries()]
      .map(([billableCategory, agg]) => {
        const row = new FleetAxleCategoryBreakdownEntity();
        row.billableCategory = billableCategory;
        row.totalAxles = agg.totalAxles;
        row.count = agg.count;
        return row;
      })
      .sort((a, b) => b.count - a.count);
    entity.topTrailersByTripCount = rankTopVehicles(trailerUsageMap, TOP_VEHICLES_LIMIT, 'count', 'desc').map(toTrailerEntry);
    entity.topTrailersByInUseMinutes = rankTopVehicles(trailerUsageMap, TOP_VEHICLES_LIMIT, 'value', 'desc').map(toTrailerEntry);
    entity.trailers = trailerIdsInvolved
      .map((trailerId) => {
        const usage = trailerUsageMap.get(trailerId);
        const info = trailerInfoMap.get(trailerId);
        const row = new FleetTrailerDowntimeEntity();
        row.trailerId = trailerId;
        row.plate = info?.plate ?? '—';
        row.type = info?.type ?? TrailerType.OTHER;
        row.inUseMinutes = usage?.value ?? 0;
        row.tripCount = usage?.count ?? 0;
        row.downtimeMinutes = trailerDowntimeMap.get(trailerId) ?? 0;
        return row;
      })
      .sort((a, b) => b.downtimeMinutes - a.downtimeMinutes || b.inUseMinutes - a.inUseMinutes);
    entity.monthlyTrendTripCount = aggregateMonthlySeries(
      monthlyTrendTrips.filter((t) => (t.composition?.trailers.length ?? 0) > 0).map((t) => ({ date: t.createdAt, value: 1 })),
      MONTHLY_TREND_MONTHS,
    );

    return entity;
  }
}
