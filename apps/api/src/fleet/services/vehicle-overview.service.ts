import { Injectable } from '@nestjs/common';
import { DriverStatus, TireStatus, TripOccurrenceSeverity, TripStatus, VehicleMaintenanceStatus, VehicleStatus } from '@prisma/client';
import { FleetOperationsQueryDto } from '../../fleet-operations/dto/fleet-operations-query.dto';
import { FleetAlertEntity, FleetAlertSeverity, FleetAlertType } from '../../fleet-operations/entities/fleet-alert.entity';
import { FleetOperationsMetricsService } from '../../fleet-operations/services/fleet-operations-metrics.service';
import { FuelHistoryQueryDto } from '../../fuel-supplies/dto/fuel-history-query.dto';
import { FuelSuppliesService } from '../../fuel-supplies/services/fuel-supplies.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NEAR_REPLACEMENT_THRESHOLD_MM } from '../../tires/services/tires.service';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import {
  VehicleCurrentDriverEntity,
  VehicleCurrentTripEntity,
  VehicleMetricsEntity,
  VehicleOverviewEntity,
  VehicleRecentTripEntity,
  VehicleTireSummaryEntity,
} from '../entities/vehicle-overview.entity';
import { VehicleDocumentEntity } from '../entities/vehicle-document.entity';
import { MaintenancesService } from './maintenances.service';
import { VehicleDocumentsService } from './vehicle-documents.service';
import { VehiclesService } from './vehicles.service';

const ACTIVE_TRIP_STATUSES: TripStatus[] = [TripStatus.IN_PROGRESS, TripStatus.PAUSED];
const RECENT_TRIPS_LIMIT = 5;
const DRIVER_HISTORY_LIMIT = 5;
const HISTORY_LIMIT = 10;
const ALERTS_LIMIT_PER_TYPE = 5;

const CURRENT_TRIP_INCLUDE = {
  driver: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
  origin: { select: { name: true } },
  destination: { select: { name: true } },
} as const;

// GET /vehicles/:id/overview -- visao consolidada do veiculo (secao 11 da
// Fase 62). Cada indicador REAPROVEITA um servico ja existente (nunca
// recalcula custo/receita/consumo/manutencao em paralelo); a unica logica
// nova aqui e a MONTAGEM da visao (motorista atual, viagem atual, alertas).
@Injectable()
export class VehicleOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehiclesService: VehiclesService,
    private readonly vehicleDocumentsService: VehicleDocumentsService,
    private readonly maintenancesService: MaintenancesService,
    private readonly fuelSuppliesService: FuelSuppliesService,
    private readonly fleetOperationsMetrics: FleetOperationsMetricsService,
  ) {}

  async getOverview(tenantId: string, vehicleId: string): Promise<VehicleOverviewEntity> {
    const vehicle = await this.vehiclesService.findOne(tenantId, vehicleId);

    const financialQuery = new FleetOperationsQueryDto();
    financialQuery.vehicleId = vehicleId;
    const fuelQuery = new FuelHistoryQueryDto();
    fuelQuery.limit = 1;

    const [
      driverHistory,
      documents,
      maintenancesPage,
      fuelHistory,
      financial,
      tripStatusGroups,
      currentTripRows,
      recentTripRows,
      historyPage,
      openMaintenanceRows,
      mountedTires,
      criticalOpenOccurrenceRows,
    ] = await Promise.all([
      this.vehiclesService.getDriverAssignmentsRaw(tenantId, vehicleId),
      this.vehicleDocumentsService.findAllRaw(tenantId, vehicleId),
      this.maintenancesService.findAllForVehicle(tenantId, vehicleId, { page: 1, pageSize: 1 }),
      this.fuelSuppliesService.getVehicleFuelHistory(tenantId, vehicleId, fuelQuery),
      this.fleetOperationsMetrics.getFinancialDashboard(tenantId, financialQuery),
      this.prisma.trip.groupBy({
        by: ['status'],
        where: { tenantId, deletedAt: null, composition: { vehicleId } },
        _count: { _all: true },
      }),
      this.prisma.trip.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: ACTIVE_TRIP_STATUSES },
          composition: { vehicleId },
        },
        include: CURRENT_TRIP_INCLUDE,
      }),
      this.prisma.trip.findMany({
        where: { tenantId, deletedAt: null, composition: { vehicleId } },
        orderBy: { createdAt: 'desc' },
        take: RECENT_TRIPS_LIMIT,
        include: { driver: { select: { name: true } }, origin: { select: { name: true } }, destination: { select: { name: true } } },
      }),
      this.vehiclesService.getHistory(tenantId, vehicleId, { page: 1, pageSize: HISTORY_LIMIT }),
      // Fase 63 -- linhas (nao so a contagem) das manutencoes ainda nao
      // concluidas/canceladas deste veiculo, para diferenciar aberta/
      // programada/em andamento/atrasada nos alertas (buildAlerts). Continua
      // sendo 1 unica query bounded ao veiculo (nunca 1 por manutencao).
      this.prisma.vehicleMaintenance.findMany({
        where: {
          tenantId,
          vehicleId,
          status: { notIn: [VehicleMaintenanceStatus.COMPLETED, VehicleMaintenanceStatus.CANCELLED] },
        },
        select: { status: true, scheduledAt: true },
      }),
      // Fase 64 -- pneus atualmente montados neste veiculo (Tire.vehicleId),
      // sempre bounded a UM veiculo -- nunca uma query por pneu.
      this.prisma.tire.findMany({
        where: { tenantId, vehicleId, status: { not: TireStatus.SCRAPPED } },
        select: { id: true, fireNumber: true, manufacturer: true, model: true, status: true, position: true, currentTreadDepthMm: true },
      }),
      // Fase 68 -- ocorrencias criticas em aberto deste veiculo (TripOccurrence,
      // Fase 67). Sempre bounded a UM veiculo -- nunca 1 query por ocorrencia.
      this.prisma.tripOccurrence.findMany({
        where: { tenantId, vehicleId, severity: TripOccurrenceSeverity.CRITICAL, resolvedAt: null, cancelledAt: null },
        select: { id: true, type: true, occurredAt: true },
        orderBy: { occurredAt: 'desc' },
      }),
    ]);

    // Data da instalacao atual de cada pneu montado = movimentacao mais
    // recente daquele pneu (por definicao, se ele esta montado aqui agora,
    // a ultima movimentacao registrada foi a que o trouxe para ca) -- mesmo
    // padrao de "distinct + orderBy" ja usado em TiresService.getDashboard.
    const mountedTireIds = mountedTires.map((t) => t.id);
    const latestMovementByTire =
      mountedTireIds.length > 0
        ? await this.prisma.tireMovement.findMany({
            where: { tenantId, tireId: { in: mountedTireIds } },
            distinct: ['tireId'],
            orderBy: [{ tireId: 'asc' }, { movementDate: 'desc' }],
            select: { tireId: true, movementDate: true },
          })
        : [];
    const installedAtByTire = new Map(latestMovementByTire.map((m) => [m.tireId, m.movementDate]));

    const currentDriverAssignment = driverHistory.find((assignment) => assignment.endedAt === null);
    const currentDriver: VehicleCurrentDriverEntity | null = currentDriverAssignment
      ? {
          driverId: currentDriverAssignment.driverId,
          driverName: currentDriverAssignment.driverName ?? '',
          driverType: currentDriverAssignment.driverType!,
          driverStatus: currentDriverAssignment.driverStatus!,
          startedAt: currentDriverAssignment.startedAt,
        }
      : null;

    // Mais de 1 viagem IN_PROGRESS/PAUSED simultanea = inconsistencia de
    // dados -- nunca escolhida arbitrariamente (secao 6 da Fase 62).
    const currentTripInconsistent = currentTripRows.length > 1;
    const currentTripRow = currentTripRows.length === 1 ? currentTripRows[0] : undefined;
    const currentTrip: VehicleCurrentTripEntity | null = currentTripRow
      ? {
          tripId: currentTripRow.id,
          status: currentTripRow.status,
          driverId: currentTripRow.driverId,
          driverName: currentTripRow.driver?.name ?? null,
          customerId: currentTripRow.customerId,
          customerName: currentTripRow.customer?.name ?? null,
          originName: currentTripRow.origin?.name ?? null,
          destinationName: currentTripRow.destination?.name ?? null,
          plannedDeparture: currentTripRow.plannedDeparture,
          plannedArrival: currentTripRow.plannedArrival,
          actualDeparture: currentTripRow.actualDeparture,
        }
      : null;

    const recentTrips: VehicleRecentTripEntity[] = recentTripRows.map((trip) => ({
      tripId: trip.id,
      status: trip.status,
      driverName: trip.driver?.name ?? null,
      originName: trip.origin?.name ?? null,
      destinationName: trip.destination?.name ?? null,
      plannedDeparture: trip.plannedDeparture,
      createdAt: trip.createdAt,
    }));

    const countByStatus = (status: TripStatus): number =>
      tripStatusGroups.find((row) => row.status === status)?._count._all ?? 0;
    const totalTrips = tripStatusGroups.reduce((sum, row) => sum + row._count._all, 0);

    const documentsProblematic = documents.filter((doc) => doc.expiryStatus === 'EXPIRED').length;

    const tires: VehicleTireSummaryEntity[] = mountedTires.map((tire) => ({
      tireId: tire.id,
      fireNumber: tire.fireNumber,
      manufacturer: tire.manufacturer,
      model: tire.model,
      status: tire.status,
      position: tire.position,
      currentTreadDepthMm: toNumberOrNull(tire.currentTreadDepthMm),
      installedAt: installedAtByTire.get(tire.id) ?? null,
    }));
    const tiresNearReplacement = tires.filter(
      (t) => t.currentTreadDepthMm !== null && t.currentTreadDepthMm <= NEAR_REPLACEMENT_THRESHOLD_MM,
    ).length;

    const metrics: VehicleMetricsEntity = {
      totalTrips,
      completedTrips: countByStatus(TripStatus.COMPLETED),
      inProgressTrips: countByStatus(TripStatus.IN_PROGRESS) + countByStatus(TripStatus.PAUSED),
      cancelledTrips: countByStatus(TripStatus.CANCELLED),
      // Sem fonte agregada confiavel de distancia realizada por veiculo
      // nesta fase (RoutePlan.plannedDistanceKm e estimativa de
      // planejamento, nem toda viagem possui RoutePlan) -- nunca inventado.
      totalDistanceKm: null,
      totalRevenue: financial.summary.totalRevenue,
      totalExpenses: financial.summary.totalExpenses,
      totalCost: financial.summary.totalCost,
      financialResult: financial.summary.result,
      marginPercent: financial.summary.marginPercent,
      documentsCount: documents.length,
      documentsProblematic,
      maintenancesCount: maintenancesPage.meta.total,
      fuelSuppliesCount: fuelHistory.suppliesCount,
      lastFuelSupplyLiters: fuelHistory.items[0]?.liters ?? null,
      lastFuelSupplyAmount: fuelHistory.items[0]?.totalAmount ?? null,
      lastFuelSupplyDate: fuelHistory.items[0]?.supplyDate ?? null,
      averageFuelConsumptionKmL: fuelHistory.averageConsumptionKmL,
      driverHistoryCount: driverHistory.length,
      tiresCount: tires.length,
      tiresNearReplacement,
      criticalOpenOccurrences: criticalOpenOccurrenceRows.length,
    };

    const alerts = this.buildAlerts({
      vehicle,
      documents,
      currentDriver,
      currentTripInconsistent,
      currentTripIds: currentTripRows.map((t) => t.id),
      openMaintenanceRows,
      tiresNearReplacement,
      hasFuelOdometerRegression: fuelHistory.hasOdometerRegression,
      criticalOpenOccurrenceRows,
    });

    const entity = new VehicleOverviewEntity();
    entity.vehicle = vehicle;
    entity.currentDriver = currentDriver;
    entity.currentTrip = currentTrip;
    entity.currentTripInconsistent = currentTripInconsistent;
    entity.metrics = metrics;
    entity.documents = documents;
    entity.alerts = alerts;
    entity.driverHistory = driverHistory.slice(0, DRIVER_HISTORY_LIMIT);
    entity.recentTrips = recentTrips;
    entity.history = historyPage.items;
    entity.tires = tires;
    return entity;
  }

  private buildAlerts(params: {
    vehicle: VehicleOverviewEntity['vehicle'];
    documents: VehicleDocumentEntity[];
    currentDriver: VehicleCurrentDriverEntity | null;
    currentTripInconsistent: boolean;
    currentTripIds: string[];
    openMaintenanceRows: { status: VehicleMaintenanceStatus; scheduledAt: Date | null }[];
    tiresNearReplacement: number;
    hasFuelOdometerRegression: boolean;
    criticalOpenOccurrenceRows: { id: string; type: string; occurredAt: Date }[];
  }): FleetAlertEntity[] {
    const {
      vehicle,
      documents,
      currentDriver,
      currentTripInconsistent,
      currentTripIds,
      openMaintenanceRows,
      tiresNearReplacement,
      hasFuelOdometerRegression,
      criticalOpenOccurrenceRows,
    } = params;
    const alerts: FleetAlertEntity[] = [];

    if (vehicle.status === VehicleStatus.SUSPENDED) {
      alerts.push(this.buildAlert('VEHICLE_SUSPENDED', 'CRITICAL', vehicle, 'Veiculo suspenso -- impedido de operar.', null));
    }
    if (vehicle.status === VehicleStatus.INACTIVE) {
      alerts.push(this.buildAlert('VEHICLE_INACTIVE', 'ATTENTION', vehicle, 'Veiculo inativo.', null));
    }
    // Fase 63 -- Vehicle.status === MAINTENANCE agora e mantido em sincronia
    // com uma VehicleMaintenance IN_PROGRESS (VehiclesService.
    // syncStatusForMaintenance) -- este alerta cobre tanto esse caso quanto
    // um MAINTENANCE setado manualmente sem registro vinculado.
    if (vehicle.status === VehicleStatus.MAINTENANCE) {
      alerts.push(
        this.buildAlert('VEHICLE_UNAVAILABLE_MAINTENANCE', 'ATTENTION', vehicle, 'Veiculo indisponivel por manutencao.', null),
      );
    }

    for (const doc of documents.filter((d) => d.expiryStatus === 'EXPIRED').slice(0, ALERTS_LIMIT_PER_TYPE)) {
      alerts.push(
        this.buildAlert('VEHICLE_DOCUMENT_EXPIRED', 'CRITICAL', vehicle, `Documento ${doc.type} vencido.`, null),
      );
    }
    for (const doc of documents.filter((d) => d.expiryStatus === 'EXPIRING_SOON').slice(0, ALERTS_LIMIT_PER_TYPE)) {
      alerts.push(
        this.buildAlert('VEHICLE_DOCUMENT_EXPIRING_SOON', 'ATTENTION', vehicle, `Documento ${doc.type} vencendo em breve.`, null),
      );
    }

    if (currentDriver && currentDriver.driverStatus !== DriverStatus.ACTIVE) {
      alerts.push(
        this.buildAlert(
          'VEHICLE_DRIVER_UNAVAILABLE',
          'CRITICAL',
          vehicle,
          `Motorista vinculado (${currentDriver.driverName}) esta ${currentDriver.driverStatus}.`,
          null,
        ),
      );
    }

    if (currentTripInconsistent) {
      alerts.push(
        this.buildAlert(
          'VEHICLE_TRIP_DATA_INCONSISTENCY',
          'CRITICAL',
          vehicle,
          `${currentTripIds.length} viagens em andamento simultaneas encontradas (ids: ${currentTripIds.join(', ')}).`,
          currentTripIds.length,
        ),
      );
    }

    if (openMaintenanceRows.length > 0) {
      alerts.push(
        this.buildAlert(
          'VEHICLE_OPEN_MAINTENANCE',
          'ATTENTION',
          vehicle,
          `${openMaintenanceRows.length} manutencao(oes) em aberto.`,
          openMaintenanceRows.length,
        ),
      );
    }

    // Fase 63 -- granularidade por situacao real (nunca soma alem do
    // agregado acima): em andamento (fisicamente na oficina agora),
    // programada (scheduledAt no futuro, ainda nao iniciada), atrasada
    // (scheduledAt no passado, ainda nao iniciada) -- nunca inventa uma
    // "atrasada" para registro sem scheduledAt (sem base real de calculo).
    const now = new Date();
    const inProgressCount = openMaintenanceRows.filter((r) => r.status === VehicleMaintenanceStatus.IN_PROGRESS).length;
    const notStartedRows = openMaintenanceRows.filter((r) => r.status !== VehicleMaintenanceStatus.IN_PROGRESS);
    const scheduledCount = notStartedRows.filter((r) => r.scheduledAt && r.scheduledAt > now).length;
    const overdueCount = notStartedRows.filter((r) => r.scheduledAt && r.scheduledAt <= now).length;

    if (inProgressCount > 0) {
      alerts.push(
        this.buildAlert(
          'VEHICLE_MAINTENANCE_IN_PROGRESS',
          'ATTENTION',
          vehicle,
          `${inProgressCount} manutencao(oes) em andamento.`,
          inProgressCount,
        ),
      );
    }
    if (scheduledCount > 0) {
      alerts.push(
        this.buildAlert(
          'VEHICLE_MAINTENANCE_SCHEDULED',
          'INFO',
          vehicle,
          `${scheduledCount} manutencao(oes) programada(s).`,
          scheduledCount,
        ),
      );
    }
    if (overdueCount > 0) {
      alerts.push(
        this.buildAlert(
          'VEHICLE_MAINTENANCE_OVERDUE',
          'CRITICAL',
          vehicle,
          `${overdueCount} manutencao(oes) com data programada ja vencida.`,
          overdueCount,
        ),
      );
    }

    // Fase 64 -- mesmo limiar/criterio de TIRE_NEAR_REPLACEMENT (GET
    // /tires/dashboard), so que agregado no escopo deste veiculo.
    if (tiresNearReplacement > 0) {
      alerts.push(
        this.buildAlert(
          'VEHICLE_TIRE_NEAR_REPLACEMENT',
          'ATTENTION',
          vehicle,
          `${tiresNearReplacement} pneu(s) proximo(s) da troca.`,
          tiresNearReplacement,
        ),
      );
    }

    // Fase 65 -- mesma deteccao de ODOMETER_REGRESSION (dashboard de
    // frota), no escopo deste veiculo -- nunca um "custo/consumo estimado"
    // sobre dado inconsistente.
    if (hasFuelOdometerRegression) {
      alerts.push(
        this.buildAlert(
          'VEHICLE_FUEL_ODOMETER_REGRESSION',
          'CRITICAL',
          vehicle,
          'Hodometro regressivo detectado entre abastecimentos -- revisao necessaria.',
          null,
        ),
      );
    }

    // Fase 68 -- 1 alerta por ocorrencia critica em aberto (nunca agregado
    // em 1 so, para preservar o tipo/momento de cada uma na UI), limitado
    // ao mesmo teto ja usado para documentos/etc acima.
    for (const occurrence of criticalOpenOccurrenceRows.slice(0, ALERTS_LIMIT_PER_TYPE)) {
      alerts.push(
        this.buildAlert(
          'VEHICLE_OCCURRENCE_CRITICAL',
          'CRITICAL',
          vehicle,
          `Ocorrencia critica em aberto: ${occurrence.type}.`,
          null,
        ),
      );
    }

    return alerts;
  }

  private buildAlert(
    type: FleetAlertType,
    severity: FleetAlertSeverity,
    vehicle: VehicleOverviewEntity['vehicle'],
    message: string,
    value: number | null,
  ): FleetAlertEntity {
    const entity = new FleetAlertEntity();
    entity.type = type;
    entity.severity = severity;
    entity.vehicleId = vehicle.id;
    entity.plate = vehicle.plate;
    entity.message = message;
    entity.value = value;
    return entity;
  }
}
