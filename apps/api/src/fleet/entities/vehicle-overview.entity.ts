import { ApiProperty } from '@nestjs/swagger';
import { DriverStatus, DriverType, TripStatus } from '@prisma/client';
import { AuditLogEntity } from '../../audit/entities/audit-log.entity';
import { FleetAlertEntity } from '../../fleet-operations/entities/fleet-alert.entity';
import { VehicleDocumentEntity } from './vehicle-document.entity';
import { VehicleDriverAssignmentEntity } from './vehicle-driver-assignment.entity';
import { VehicleEntity } from './vehicle.entity';

export class VehicleCurrentDriverEntity {
  @ApiProperty({ format: 'uuid' })
  driverId!: string;

  @ApiProperty()
  driverName!: string;

  @ApiProperty({ enum: DriverType })
  driverType!: DriverType;

  @ApiProperty({ enum: DriverStatus })
  driverStatus!: DriverStatus;

  @ApiProperty()
  startedAt!: Date;
}

export class VehicleCurrentTripEntity {
  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ enum: TripStatus })
  status!: TripStatus;

  @ApiProperty({ format: 'uuid', nullable: true })
  driverId!: string | null;

  @ApiProperty({ nullable: true })
  driverName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  customerId!: string | null;

  @ApiProperty({ nullable: true })
  customerName!: string | null;

  @ApiProperty({ nullable: true })
  originName!: string | null;

  @ApiProperty({ nullable: true })
  destinationName!: string | null;

  @ApiProperty({ nullable: true })
  plannedDeparture!: Date | null;

  @ApiProperty({ nullable: true })
  plannedArrival!: Date | null;

  @ApiProperty({ nullable: true })
  actualDeparture!: Date | null;
}

export class VehicleRecentTripEntity {
  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ enum: TripStatus })
  status!: TripStatus;

  @ApiProperty({ nullable: true })
  driverName!: string | null;

  @ApiProperty({ nullable: true })
  originName!: string | null;

  @ApiProperty({ nullable: true })
  destinationName!: string | null;

  @ApiProperty({ nullable: true })
  plannedDeparture!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}

// Contadores/indicadores sempre reaproveitados de servicos ja existentes
// (nunca recalculados em paralelo -- secao 7 da Fase 62). Campos sem fonte
// confiavel ficam null, nunca 0 (nao mascarar ausencia de dado).
export class VehicleMetricsEntity {
  @ApiProperty()
  totalTrips!: number;

  @ApiProperty()
  completedTrips!: number;

  @ApiProperty()
  inProgressTrips!: number;

  @ApiProperty()
  cancelledTrips!: number;

  @ApiProperty({
    nullable: true,
    description: 'Sem fonte agregada confiavel de distancia percorrida por veiculo nesta fase (ver docs/vehicle-management.md).',
  })
  totalDistanceKm!: number | null;

  @ApiProperty({ description: 'Reaproveita FleetFinancialSummaryEntity.totalRevenue (GET /fleet-operations/financial?vehicleId=).' })
  totalRevenue!: number;

  @ApiProperty()
  totalExpenses!: number;

  @ApiProperty()
  totalCost!: number;

  @ApiProperty()
  financialResult!: number;

  @ApiProperty({ nullable: true })
  marginPercent!: number | null;

  @ApiProperty()
  documentsCount!: number;

  @ApiProperty({ description: 'Documentos com expiryStatus = EXPIRED.' })
  documentsProblematic!: number;

  @ApiProperty()
  maintenancesCount!: number;

  @ApiProperty()
  fuelSuppliesCount!: number;

  @ApiProperty()
  driverHistoryCount!: number;
}

export class VehicleOverviewEntity {
  @ApiProperty({ type: VehicleEntity })
  vehicle!: VehicleEntity;

  @ApiProperty({ type: VehicleCurrentDriverEntity, nullable: true })
  currentDriver!: VehicleCurrentDriverEntity | null;

  @ApiProperty({ type: VehicleCurrentTripEntity, nullable: true })
  currentTrip!: VehicleCurrentTripEntity | null;

  @ApiProperty({
    description:
      'true quando mais de 1 viagem IN_PROGRESS/PAUSED foi encontrada simultaneamente para este veiculo ' +
      '(inconsistencia de dados) -- nesse caso currentTrip fica null e um alerta CRITICAL e emitido.',
  })
  currentTripInconsistent!: boolean;

  @ApiProperty({ type: VehicleMetricsEntity })
  metrics!: VehicleMetricsEntity;

  @ApiProperty({ type: [VehicleDocumentEntity] })
  documents!: VehicleDocumentEntity[];

  @ApiProperty({ type: [FleetAlertEntity] })
  alerts!: FleetAlertEntity[];

  @ApiProperty({ type: [VehicleDriverAssignmentEntity], description: 'Ultimos vinculos de motorista (mais recente primeiro, limitado).' })
  driverHistory!: VehicleDriverAssignmentEntity[];

  @ApiProperty({ type: [VehicleRecentTripEntity] })
  recentTrips!: VehicleRecentTripEntity[];

  @ApiProperty({ type: [AuditLogEntity], description: 'Ultimas entradas de auditoria do veiculo (limitado).' })
  history!: AuditLogEntity[];
}
