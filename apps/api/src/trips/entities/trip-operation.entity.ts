import { ApiProperty } from '@nestjs/swagger';
import { AlertSeverity, AlertType, TripStatus } from '@prisma/client';
import { ReconciliationStatus } from '../../toll-routes/utils/toll-reconciliation.util';
import { LocationFreshness, MovementStatus, OperationalStatus } from '../utils/operational-status.util';

// Fase 29 -- ultima posicao conhecida (TrackingPoint), sem nenhum dado
// inventado: quando o campo nao existe no TrackingPoint (ex: precisao), ele
// simplesmente nao aparece aqui.
export class TripOperationPositionEntity {
  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiProperty()
  recordedAt!: Date;

  @ApiProperty({ nullable: true })
  speedKmh!: number | null;

  @ApiProperty({ nullable: true })
  headingDeg!: number | null;
}

// Resumo de pedagios (Fase 22/23/26) -- contagens apenas; o detalhe completo
// (por praca) continua nas abas ja existentes (Pedagios/Conciliacao) da
// pagina da viagem, nunca duplicado aqui.
export class TripOperationTollSummaryEntity {
  @ApiProperty({ description: 'Quantidade de pracas previstas pela rota (RoutePlanToll/TollRoute).' })
  plannedCount!: number;

  @ApiProperty({ description: 'Quantidade de TollTransaction ja registradas nesta viagem.' })
  registeredCount!: number;

  @ApiProperty({ description: 'Pracas previstas que ainda nao tiveram passagem registrada.' })
  pendingCount!: number;

  @ApiProperty({ description: 'TollTransaction registradas fora da rota prevista.' })
  unplannedCount!: number;

  @ApiProperty({ enum: ['PENDING', 'CONFORM', 'ATTENTION', 'CRITICAL', 'UNVERIFIABLE'] })
  reconciliationStatus!: ReconciliationStatus;
}

export class TripOperationAlertEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: AlertType })
  type!: AlertType;

  @ApiProperty({ enum: AlertSeverity })
  severity!: AlertSeverity;

  @ApiProperty()
  message!: string;

  @ApiProperty()
  createdAt!: Date;
}

// GET /trips/operations/active -- uma linha por viagem nao terminada
// (PLANNED..PAUSED), pensada para o painel de monitoramento (Fase 29).
// Deliberadamente enxuta: nenhum historico completo (TrackingPoints,
// TollTransactions, AuditLog inteiros) trafega aqui -- ver TripsService.
export class TripOperationEntity {
  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ enum: TripStatus, description: 'Ciclo de vida da viagem (nao muda com o Fase 29).' })
  status!: TripStatus;

  @ApiProperty({
    enum: ['MOVING', 'STOPPED', 'STALE', 'OFF_ROUTE', 'PAUSED', 'COMPLETED', 'UNKNOWN'],
    description: 'Situacao ATUAL, derivada a cada consulta -- nunca persistida, distinta de status.',
  })
  operationalStatus!: OperationalStatus;

  @ApiProperty({ format: 'uuid', nullable: true })
  driverId!: string | null;

  @ApiProperty({ nullable: true })
  driverName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  vehicleId!: string | null;

  @ApiProperty({ nullable: true })
  vehiclePlate!: string | null;

  @ApiProperty()
  originName!: string;

  @ApiProperty()
  destinationName!: string;

  @ApiProperty({ nullable: true })
  actualDeparture!: Date | null;

  @ApiProperty({ nullable: true })
  initialOdometerKm!: number | null;

  @ApiProperty({ nullable: true })
  currentOdometerKm!: number | null;

  @ApiProperty({ type: TripOperationPositionEntity, nullable: true })
  lastPosition!: TripOperationPositionEntity | null;

  @ApiProperty({
    nullable: true,
    description: 'Minutos desde a ultima posicao conhecida (null quando nunca houve nenhuma).',
  })
  minutesSinceLastUpdate!: number | null;

  @ApiProperty({
    enum: ['ONLINE', 'STALE', 'OFFLINE'],
    description:
      'Classificacao da localizacao (secao 4): ONLINE = atualizacao recente; STALE = acima do ' +
      'limiar operacional; OFFLINE = nunca houve posicao ou esta muito desatualizada.',
  })
  locationFreshness!: LocationFreshness;

  @ApiProperty({ enum: ['MOVING', 'STOPPED', 'UNKNOWN'] })
  movementStatus!: MovementStatus;

  @ApiProperty()
  hasUnresolvedDeviation!: boolean;

  @ApiProperty({ description: 'Houve pelo menos um recalculo de rota (RoutePlan novo) nesta viagem.' })
  hasRecalculatedRoute!: boolean;

  @ApiProperty({ format: 'uuid', nullable: true })
  routePlanId!: string | null;

  @ApiProperty({ nullable: true })
  defaultAxles!: number | null;

  @ApiProperty({ type: TripOperationTollSummaryEntity })
  tollSummary!: TripOperationTollSummaryEntity;

  @ApiProperty({ type: TripOperationAlertEntity, isArray: true })
  alerts!: TripOperationAlertEntity[];
}

export class TripOperationsListEntity {
  @ApiProperty({ type: TripOperationEntity, isArray: true })
  items!: TripOperationEntity[];
}
