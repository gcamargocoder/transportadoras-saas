import { Injectable } from '@nestjs/common';
import {
  ExpenseStatus,
  Prisma,
  TripStatus,
  VehicleMaintenanceStatus,
  VehicleStatus,
} from '@prisma/client';
import { compact } from '../../common/utils/compact.util';
import { aggregateMonthlySeries, buildMonthlyRange } from '../../common/utils/monthly-series.util';
import { OPEN_MAINTENANCE_STATUSES } from '../../fleet/utils/maintenance-status-transition.util';
import { FindFuelSuppliesQueryDto } from '../../fuel-supplies/dto/find-fuel-supplies-query.dto';
import { FuelSuppliesService } from '../../fuel-supplies/services/fuel-supplies.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { DashboardChartsEntity } from '../entities/dashboard-charts.entity';
import { DashboardEntity } from '../entities/dashboard.entity';
import { DashboardFinancialEntity } from '../entities/dashboard-financial.entity';
import { DashboardFleetEntity } from '../entities/dashboard-fleet.entity';
import { DashboardOperationalEntity } from '../entities/dashboard-operational.entity';
import { DashboardOverviewEntity } from '../entities/dashboard-overview.entity';

const MONTHS_BACK = 12;

// Manutencoes "em aberto" vs "encerradas" -- unica divisao binaria possivel
// dos status de VehicleMaintenanceStatus sem inventar uma categoria nova.
// Fase 82 -- OPEN_MAINTENANCE_STATUSES agora importado da fonte central
// (inclui os 3 novos estados do ciclo de vida da OS).
const CLOSED_MAINTENANCE_STATUSES: VehicleMaintenanceStatus[] = [
  VehicleMaintenanceStatus.COMPLETED,
  VehicleMaintenanceStatus.CANCELLED,
];

// "Viagem ativa" -- mesma definicao ja usada em TripsService (guarda de
// veiculo/motorista ja em outra viagem): IN_PROGRESS ou PAUSED.
const ACTIVE_TRIP_STATUSES: TripStatus[] = [TripStatus.IN_PROGRESS, TripStatus.PAUSED];

interface DashboardFilters {
  startDate?: Date;
  endDate?: Date;
  vehicleId?: string;
  driverId?: string;
  customerId?: string;
}

// Modulo somente leitura (Fase 19) -- nunca grava AuditLog. Todas as
// secoes sao consultadas em paralelo (Promise.all) e, dentro de cada
// secao, cada agregacao tambem roda em paralelo -- nenhuma consulta e
// repetida, nenhum loop consulta o banco por item (sem N+1).
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fuelSuppliesService: FuelSuppliesService,
  ) {}

  async getDashboard(tenantId: string, query: DashboardQueryDto): Promise<DashboardEntity> {
    const filters = this.parseFilters(query);

    const [overview, financial, operational, fleet, charts] = await Promise.all([
      this.getOverview(tenantId, filters),
      this.getFinancial(tenantId, filters),
      this.getOperational(tenantId, filters),
      this.getFleet(tenantId, filters),
      this.getCharts(tenantId, filters),
    ]);

    const entity = new DashboardEntity();
    entity.overview = overview;
    entity.financial = financial;
    entity.operational = operational;
    entity.fleet = fleet;
    entity.charts = charts;
    return entity;
  }

  // ==========================================================================
  // OVERVIEW
  // ==========================================================================
  private async getOverview(
    tenantId: string,
    filters: DashboardFilters,
  ): Promise<DashboardOverviewEntity> {
    const tripWhere = this.buildTripWhere(tenantId, filters, this.dateRangeFilter(filters));

    const [
      totalTrips,
      activeTrips,
      finishedTrips,
      cancelledTrips,
      totalDrivers,
      activeDrivers,
      totalVehicles,
      availableVehicles,
      maintenanceVehicles,
      fuelStations,
      customers,
    ] = await Promise.all([
      this.prisma.trip.count({ where: tripWhere }),
      this.prisma.trip.count({ where: { ...tripWhere, status: { in: ACTIVE_TRIP_STATUSES } } }),
      this.prisma.trip.count({ where: { ...tripWhere, status: TripStatus.COMPLETED } }),
      this.prisma.trip.count({ where: { ...tripWhere, status: TripStatus.CANCELLED } }),
      this.prisma.driver.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.driver.count({ where: { tenantId, deletedAt: null, isActive: true } }),
      this.prisma.vehicle.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.vehicle.count({
        where: { tenantId, deletedAt: null, status: VehicleStatus.ACTIVE },
      }),
      this.prisma.vehicle.count({
        where: { tenantId, deletedAt: null, status: VehicleStatus.MAINTENANCE },
      }),
      this.prisma.fuelStation.count({ where: { tenantId } }),
      this.prisma.customer.count({ where: { tenantId } }),
    ]);

    const entity = new DashboardOverviewEntity();
    entity.totalTrips = totalTrips;
    entity.activeTrips = activeTrips;
    entity.finishedTrips = finishedTrips;
    entity.cancelledTrips = cancelledTrips;
    entity.totalDrivers = totalDrivers;
    entity.activeDrivers = activeDrivers;
    entity.totalVehicles = totalVehicles;
    entity.availableVehicles = availableVehicles;
    entity.maintenanceVehicles = maintenanceVehicles;
    entity.fuelStations = fuelStations;
    entity.customers = customers;
    return entity;
  }

  // ==========================================================================
  // FINANCIAL
  // ==========================================================================
  private async getFinancial(
    tenantId: string,
    filters: DashboardFilters,
  ): Promise<DashboardFinancialEntity> {
    const dateRange = this.dateRangeFilter(filters);
    const revenueWhere = this.buildRevenueWhere(tenantId, filters, dateRange);
    const expenseWhere = this.buildExpenseWhere(tenantId, filters, dateRange);
    const advanceWhere = this.buildAdvanceWhere(tenantId, filters, dateRange);

    const [revenueAgg, expenseAgg, advanceAgg] = await Promise.all([
      this.prisma.tripRevenue.aggregate({
        where: revenueWhere,
        _sum: { amount: true },
        _count: { _all: true },
        _max: { amount: true },
      }),
      this.prisma.tripExpense.aggregate({
        where: expenseWhere,
        _sum: { amount: true },
        _count: { _all: true },
        _max: { amount: true },
      }),
      this.prisma.tripAdvance.aggregate({ where: advanceWhere, _sum: { amount: true } }),
    ]);

    const totalRevenue = Number(revenueAgg._sum.amount ?? 0);
    const approvedExpenses = Number(expenseAgg._sum.amount ?? 0);
    const advances = Number(advanceAgg._sum.amount ?? 0);
    const profit = totalRevenue - approvedExpenses;
    const netResult = profit - advances;
    const revenueCount = revenueAgg._count._all;
    const expenseCount = expenseAgg._count._all;

    const entity = new DashboardFinancialEntity();
    entity.totalRevenue = totalRevenue;
    entity.approvedExpenses = approvedExpenses;
    entity.advances = advances;
    entity.profit = profit;
    entity.netResult = netResult;
    entity.averageTripRevenue = revenueCount > 0 ? totalRevenue / revenueCount : 0;
    entity.averageTripExpense = expenseCount > 0 ? approvedExpenses / expenseCount : 0;
    entity.largestRevenue = Number(revenueAgg._max.amount ?? 0);
    entity.largestExpense = Number(expenseAgg._max.amount ?? 0);
    entity.margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
    return entity;
  }

  // ==========================================================================
  // OPERATIONAL
  // ==========================================================================
  private async getOperational(
    tenantId: string,
    filters: DashboardFilters,
  ): Promise<DashboardOperationalEntity> {
    // todayTrips/lateTrips/tripsInProgress/completedToday sao "estado
    // atual" -- nao aplicam startDate/endDate (so vehicle/driver/customer).
    const tripWhere = this.buildTripWhere(tenantId, filters, undefined);

    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const [todayTrips, lateTrips, tripsInProgress, completedToday, metricsAgg] = await Promise.all([
      this.prisma.trip.count({
        where: { ...tripWhere, plannedDeparture: { gte: todayStart, lt: todayEnd } },
      }),
      this.prisma.trip.count({
        where: {
          ...tripWhere,
          plannedArrival: { lt: now },
          status: { notIn: [TripStatus.COMPLETED, TripStatus.CANCELLED] },
        },
      }),
      this.prisma.trip.count({ where: { ...tripWhere, status: TripStatus.IN_PROGRESS } }),
      this.prisma.trip.count({
        where: {
          ...tripWhere,
          status: TripStatus.COMPLETED,
          actualArrival: { gte: todayStart, lt: todayEnd },
        },
      }),
      this.prisma.tripMetrics.aggregate({
        where: this.buildMetricsWhere(tenantId, filters),
        _sum: { actualDistanceKm: true },
        _count: { actualDistanceKm: true },
      }),
    ]);

    const kmDriven = Number(metricsAgg._sum.actualDistanceKm ?? 0);
    const distanceCount = metricsAgg._count.actualDistanceKm;

    const entity = new DashboardOperationalEntity();
    entity.todayTrips = todayTrips;
    entity.lateTrips = lateTrips;
    entity.tripsInProgress = tripsInProgress;
    entity.completedToday = completedToday;
    entity.kmDriven = kmDriven;
    entity.averageTripDistance = distanceCount > 0 ? kmDriven / distanceCount : 0;
    return entity;
  }

  // ==========================================================================
  // FLEET -- fuelConsumed/fuelCost/averageConsumptionKmL/costPerKm
  // reaproveitados INTEGRALMENTE de FuelSuppliesService.getDashboard
  // (Fase 18), nunca recalculados aqui.
  // ==========================================================================
  private async getFleet(
    tenantId: string,
    filters: DashboardFilters,
  ): Promise<DashboardFleetEntity> {
    const fuelQuery = new FindFuelSuppliesQueryDto();
    if (filters.vehicleId) fuelQuery.vehicleId = filters.vehicleId;
    if (filters.driverId) fuelQuery.driverId = filters.driverId;
    if (filters.startDate) fuelQuery.supplyDateFrom = filters.startDate.toISOString();
    if (filters.endDate) fuelQuery.supplyDateTo = filters.endDate.toISOString();

    const maintenanceWhere = this.buildMaintenanceWhere(
      tenantId,
      filters,
      this.dateRangeFilter(filters),
    );

    const [fuelDashboard, maintenanceAgg, maintenanceOpen, maintenanceClosed] = await Promise.all([
      this.fuelSuppliesService.getDashboard(tenantId, fuelQuery),
      this.prisma.vehicleMaintenance.aggregate({
        where: maintenanceWhere,
        _sum: { totalCost: true },
      }),
      this.prisma.vehicleMaintenance.count({
        where: { ...maintenanceWhere, status: { in: OPEN_MAINTENANCE_STATUSES } },
      }),
      this.prisma.vehicleMaintenance.count({
        where: { ...maintenanceWhere, status: { in: CLOSED_MAINTENANCE_STATUSES } },
      }),
    ]);

    const entity = new DashboardFleetEntity();
    entity.fuelConsumed = fuelDashboard.totalLiters;
    entity.fuelCost = fuelDashboard.totalAmount;
    entity.averageConsumptionKmL = fuelDashboard.averageConsumptionKmL ?? 0;
    entity.costPerKm = fuelDashboard.costPerKm ?? 0;
    entity.maintenanceCost = Number(maintenanceAgg._sum.totalCost ?? 0);
    entity.maintenanceOpen = maintenanceOpen;
    entity.maintenanceClosed = maintenanceClosed;
    return entity;
  }

  // ==========================================================================
  // CHARTS -- sempre os ultimos 12 meses (ignora startDate/endDate;
  // vehicleId/driverId/customerId ainda se aplicam quando fizer sentido).
  // Uma unica consulta bruta por grafico (sem N+1), agregada em memoria
  // pelo util compartilhado monthly-series.util.ts.
  // ==========================================================================
  private async getCharts(
    tenantId: string,
    filters: DashboardFilters,
  ): Promise<DashboardChartsEntity> {
    const range = buildMonthlyRange(MONTHS_BACK);
    const floor = range[0]?.start ?? new Date();
    const chartsDateRange: Prisma.DateTimeFilter = { gte: floor };

    const revenueWhere = this.buildRevenueWhere(tenantId, filters, chartsDateRange);
    const expenseWhere = this.buildExpenseWhere(tenantId, filters, chartsDateRange);
    const fuelWhere = this.buildFuelWhere(tenantId, filters, chartsDateRange);
    const tripWhere = this.buildTripWhere(tenantId, filters, chartsDateRange);

    const [revenueRows, expenseRows, fuelRows, tripRows] = await Promise.all([
      this.prisma.tripRevenue.findMany({
        where: revenueWhere,
        select: { receivedAt: true, amount: true },
      }),
      this.prisma.tripExpense.findMany({
        where: expenseWhere,
        select: { expenseDate: true, amount: true },
      }),
      this.prisma.fuelSupply.findMany({
        where: fuelWhere,
        select: { supplyDate: true, totalAmount: true },
      }),
      this.prisma.trip.findMany({ where: tripWhere, select: { createdAt: true } }),
    ]);

    const entity = new DashboardChartsEntity();
    entity.monthlyRevenue = aggregateMonthlySeries(
      revenueRows.map((r) => ({ date: r.receivedAt, value: Number(r.amount) })),
      MONTHS_BACK,
    );
    entity.monthlyExpenses = aggregateMonthlySeries(
      expenseRows.map((r) => ({ date: r.expenseDate, value: Number(r.amount) })),
      MONTHS_BACK,
    );
    entity.monthlyFuelCost = aggregateMonthlySeries(
      fuelRows.map((r) => ({ date: r.supplyDate, value: Number(r.totalAmount) })),
      MONTHS_BACK,
    );
    entity.monthlyTrips = aggregateMonthlySeries(
      tripRows.map((r) => ({ date: r.createdAt, value: 1 })),
      MONTHS_BACK,
    );
    return entity;
  }

  // ==========================================================================
  // Filtros / where-builders -- todos usam compact() (nao spreads
  // condicionais de variavel) para montar o objeto: sob
  // exactOptionalPropertyTypes, `...(cond ? {chave: valor} : {})` a partir
  // de uma variavel ja tipada `T | undefined` faz o TypeScript inferir
  // `chave?: T | undefined` (nao aceito pelos tipos gerados do Prisma) --
  // compact() e o padrao ja usado no projeto para este exato problema (ver
  // common/utils/compact.util.ts).
  // ==========================================================================
  private parseFilters(query: DashboardQueryDto): DashboardFilters {
    return compact({
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      vehicleId: query.vehicleId,
      driverId: query.driverId,
      customerId: query.customerId,
    });
  }

  private dateRangeFilter(filters: DashboardFilters): Prisma.DateTimeFilter | undefined {
    if (!filters.startDate && !filters.endDate) return undefined;
    return compact({ gte: filters.startDate, lte: filters.endDate });
  }

  private buildTripWhere(
    tenantId: string,
    filters: DashboardFilters,
    dateRange: Prisma.DateTimeFilter | undefined,
  ): Prisma.TripWhereInput {
    return {
      tenantId,
      deletedAt: null,
      ...compact({
        composition: filters.vehicleId ? { vehicleId: filters.vehicleId } : undefined,
        driverId: filters.driverId,
        customerId: filters.customerId,
        createdAt: dateRange,
      }),
    };
  }

  private buildMetricsWhere(
    tenantId: string,
    filters: DashboardFilters,
  ): Prisma.TripMetricsWhereInput {
    return {
      tenantId,
      trip: {
        deletedAt: null,
        ...compact({
          composition: filters.vehicleId ? { vehicleId: filters.vehicleId } : undefined,
          driverId: filters.driverId,
          customerId: filters.customerId,
          createdAt: this.dateRangeFilter(filters),
        }),
      },
    };
  }

  // TripRevenue nao tem vehicleId/driverId diretos -- filtra via join com Trip.
  private buildRevenueWhere(
    tenantId: string,
    filters: DashboardFilters,
    dateRange: Prisma.DateTimeFilter | undefined,
  ): Prisma.TripRevenueWhereInput {
    const tripFilter = compact({
      composition: filters.vehicleId ? { vehicleId: filters.vehicleId } : undefined,
      driverId: filters.driverId,
    });

    return {
      tenantId,
      ...compact({
        customerId: filters.customerId,
        trip: Object.keys(tripFilter).length > 0 ? tripFilter : undefined,
        receivedAt: dateRange,
      }),
    };
  }

  // TripExpense ja tem vehicleId/driverId denormalizados (Fase 16) --
  // filtro direto, sem join. customerId so existe via a Trip relacionada.
  private buildExpenseWhere(
    tenantId: string,
    filters: DashboardFilters,
    dateRange: Prisma.DateTimeFilter | undefined,
  ): Prisma.TripExpenseWhereInput {
    return {
      tenantId,
      status: ExpenseStatus.APPROVED,
      ...compact({
        vehicleId: filters.vehicleId,
        driverId: filters.driverId,
        trip: filters.customerId ? { customerId: filters.customerId } : undefined,
        expenseDate: dateRange,
      }),
    };
  }

  // TripAdvance tem driverId direto (Fase 17), mas nao vehicleId -- este
  // exige join com Trip.
  private buildAdvanceWhere(
    tenantId: string,
    filters: DashboardFilters,
    dateRange: Prisma.DateTimeFilter | undefined,
  ): Prisma.TripAdvanceWhereInput {
    const tripFilter = compact({
      composition: filters.vehicleId ? { vehicleId: filters.vehicleId } : undefined,
      customerId: filters.customerId,
    });

    return {
      tenantId,
      ...compact({
        driverId: filters.driverId,
        trip: Object.keys(tripFilter).length > 0 ? tripFilter : undefined,
        paidAt: dateRange,
      }),
    };
  }

  private buildFuelWhere(
    tenantId: string,
    filters: DashboardFilters,
    dateRange: Prisma.DateTimeFilter | undefined,
  ): Prisma.FuelSupplyWhereInput {
    return {
      tenantId,
      ...compact({
        vehicleId: filters.vehicleId,
        driverId: filters.driverId,
        supplyDate: dateRange,
      }),
    };
  }

  private buildMaintenanceWhere(
    tenantId: string,
    filters: DashboardFilters,
    dateRange: Prisma.DateTimeFilter | undefined,
  ): Prisma.VehicleMaintenanceWhereInput {
    return {
      tenantId,
      ...compact({
        vehicleId: filters.vehicleId,
        openedAt: dateRange,
      }),
    };
  }
}
