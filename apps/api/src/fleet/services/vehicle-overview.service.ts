import { Injectable } from '@nestjs/common';
import { DriverStatus, TripStatus, VehicleMaintenanceStatus, VehicleStatus } from '@prisma/client';
import { FleetOperationsQueryDto } from '../../fleet-operations/dto/fleet-operations-query.dto';
import { FleetAlertEntity, FleetAlertSeverity, FleetAlertType } from '../../fleet-operations/entities/fleet-alert.entity';
import { FleetOperationsMetricsService } from '../../fleet-operations/services/fleet-operations-metrics.service';
import { FuelHistoryQueryDto } from '../../fuel-supplies/dto/fuel-history-query.dto';
import { FuelSuppliesService } from '../../fuel-supplies/services/fuel-supplies.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  VehicleCurrentDriverEntity,
  VehicleCurrentTripEntity,
  VehicleMetricsEntity,
  VehicleOverviewEntity,
  VehicleRecentTripEntity,
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
      openMaintenances,
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
      this.prisma.vehicleMaintenance.count({
        where: {
          tenantId,
          vehicleId,
          status: { notIn: [VehicleMaintenanceStatus.COMPLETED, VehicleMaintenanceStatus.CANCELLED] },
        },
      }),
    ]);

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
      driverHistoryCount: driverHistory.length,
    };

    const alerts = this.buildAlerts({
      vehicle,
      documents,
      currentDriver,
      currentTripInconsistent,
      currentTripIds: currentTripRows.map((t) => t.id),
      openMaintenances,
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
    return entity;
  }

  private buildAlerts(params: {
    vehicle: VehicleOverviewEntity['vehicle'];
    documents: VehicleDocumentEntity[];
    currentDriver: VehicleCurrentDriverEntity | null;
    currentTripInconsistent: boolean;
    currentTripIds: string[];
    openMaintenances: number;
  }): FleetAlertEntity[] {
    const { vehicle, documents, currentDriver, currentTripInconsistent, currentTripIds, openMaintenances } = params;
    const alerts: FleetAlertEntity[] = [];

    if (vehicle.status === VehicleStatus.SUSPENDED) {
      alerts.push(this.buildAlert('VEHICLE_SUSPENDED', 'CRITICAL', vehicle, 'Veiculo suspenso -- impedido de operar.', null));
    }
    if (vehicle.status === VehicleStatus.INACTIVE) {
      alerts.push(this.buildAlert('VEHICLE_INACTIVE', 'ATTENTION', vehicle, 'Veiculo inativo.', null));
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

    if (openMaintenances > 0) {
      alerts.push(
        this.buildAlert('VEHICLE_OPEN_MAINTENANCE', 'ATTENTION', vehicle, `${openMaintenances} manutencao(oes) em aberto.`, openMaintenances),
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
