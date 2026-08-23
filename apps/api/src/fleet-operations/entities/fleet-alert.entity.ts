import { ApiProperty } from '@nestjs/swagger';

// Fase 41 -- camada de alertas operacionais (secao J do pedido). Computada
// inteiramente em memoria a partir de dados JA agregados neste modulo
// (custos/manutencao/paradas/checklist) -- NUNCA persistida (o model Alert
// existente e de outro dominio, so ROUTE_DEVIATION e criado por
// RoutingService; reusa-lo aqui exigiria um AlertType novo e conflitaria
// semanticamente, fora do escopo desta fase). Thresholds centralizados em
// constants/fleet-operations-alerts.constants.ts, nunca numero magico.
export type FleetAlertType =
  | 'COST_OUTLIER'
  | 'MAINTENANCE_OUTLIER'
  | 'STOP_TIME_OUTLIER'
  | 'STALLED_VEHICLE'
  | 'PENDING_CHECKLIST'
  // Fase 42 -- abastecimento (ver fleet-operations-alerts.constants.ts).
  | 'FUEL_PRICE_OUTLIER'
  | 'CONSUMPTION_OUTLIER_HIGH'
  | 'CONSUMPTION_OUTLIER_LOW'
  | 'SUPPLY_VOLUME_OUTLIER'
  | 'ODOMETER_REGRESSION'
  // Fase 45 -- manutencao (ver fleet-operations-alerts.constants.ts).
  // MAINTENANCE_OVERDUE/MAINTENANCE_DUE_SOON tambem aparecem, com mais
  // detalhe estruturado (componente/data/km), em overdueMaintenances/
  // upcomingMaintenances (FleetMaintenanceDashboardEntity).
  | 'MAINTENANCE_OVERDUE'
  | 'MAINTENANCE_DUE_SOON'
  | 'HIGH_COST'
  | 'EXCESSIVE_BREAKDOWN'
  | 'EXCESSIVE_DOWNTIME'
  | 'CRITICAL_COMPONENT'
  // Iteracao de redesign visual -- pneus (ver
  // fleet-operations-metrics.service.ts, computeTiresOverview).
  | 'TIRE_NEAR_REPLACEMENT'
  // Tempo parado e receita perdida (ver computeDowntimeCost).
  | 'DOWNTIME_COST_OUTLIER'
  // Fase 62 -- visao operacional do veiculo (GET /vehicles/:id/overview,
  // VehicleOverviewService). Reaproveita esta MESMA classe/tipo -- nunca um
  // sistema de alertas paralelo.
  | 'VEHICLE_SUSPENDED'
  | 'VEHICLE_INACTIVE'
  | 'VEHICLE_DOCUMENT_EXPIRED'
  | 'VEHICLE_DOCUMENT_EXPIRING_SOON'
  | 'VEHICLE_DRIVER_UNAVAILABLE'
  | 'VEHICLE_TRIP_DATA_INCONSISTENCY'
  | 'VEHICLE_OPEN_MAINTENANCE'
  // Fase 63 -- manutencao (GET /vehicles/:id/overview, VehicleOverviewService)
  // quebra o alerta agregado VEHICLE_OPEN_MAINTENANCE em granularidade por
  // situacao real da manutencao (nunca substitui o agregado, so complementa).
  | 'VEHICLE_MAINTENANCE_IN_PROGRESS'
  | 'VEHICLE_MAINTENANCE_SCHEDULED'
  | 'VEHICLE_MAINTENANCE_OVERDUE'
  | 'VEHICLE_UNAVAILABLE_MAINTENANCE'
  // Fase 64 -- pneu(s) do veiculo proximo(s) da troca (mesmo limiar de
  // NEAR_REPLACEMENT_THRESHOLD_MM ja usado em TIRE_NEAR_REPLACEMENT/
  // GET /tires/dashboard, so que no escopo de UM veiculo).
  | 'VEHICLE_TIRE_NEAR_REPLACEMENT'
  // Fase 65 -- hodometro regressivo entre abastecimentos deste veiculo
  // (mesma deteccao de ODOMETER_REGRESSION, no escopo de UM veiculo).
  | 'VEHICLE_FUEL_ODOMETER_REGRESSION'
  // Fase 68 -- TripOccurrence (Fase 67) com severity=CRITICAL e status=OPEN
  // (resolvedAt/cancelledAt nulos). TRIP_OCCURRENCE_CRITICAL aparece no
  // dashboard consolidado (GET /fleet-operations/dashboard, computeAlerts);
  // VEHICLE_OCCURRENCE_CRITICAL e o equivalente no escopo de UM veiculo
  // (GET /vehicles/:id/overview, VehicleOverviewService), mesmo par
  // fleet-wide/per-vehicle ja usado para manutencao/pneu/hodometro acima.
  // Deixa de ser alerta assim que resolvedAt OU cancelledAt e preenchido --
  // nunca uma maquina de estados nova, so reflete o status ja derivado.
  | 'TRIP_OCCURRENCE_CRITICAL'
  | 'VEHICLE_OCCURRENCE_CRITICAL';

export type FleetAlertSeverity = 'INFO' | 'ATTENTION' | 'CRITICAL';

export const FLEET_ALERT_TYPES: FleetAlertType[] = [
  'COST_OUTLIER',
  'MAINTENANCE_OUTLIER',
  'STOP_TIME_OUTLIER',
  'STALLED_VEHICLE',
  'PENDING_CHECKLIST',
  'FUEL_PRICE_OUTLIER',
  'CONSUMPTION_OUTLIER_HIGH',
  'CONSUMPTION_OUTLIER_LOW',
  'SUPPLY_VOLUME_OUTLIER',
  'ODOMETER_REGRESSION',
  'MAINTENANCE_OVERDUE',
  'MAINTENANCE_DUE_SOON',
  'HIGH_COST',
  'EXCESSIVE_BREAKDOWN',
  'EXCESSIVE_DOWNTIME',
  'CRITICAL_COMPONENT',
  'TIRE_NEAR_REPLACEMENT',
  'DOWNTIME_COST_OUTLIER',
  'VEHICLE_SUSPENDED',
  'VEHICLE_INACTIVE',
  'VEHICLE_DOCUMENT_EXPIRED',
  'VEHICLE_DOCUMENT_EXPIRING_SOON',
  'VEHICLE_DRIVER_UNAVAILABLE',
  'VEHICLE_TRIP_DATA_INCONSISTENCY',
  'VEHICLE_OPEN_MAINTENANCE',
  'VEHICLE_MAINTENANCE_IN_PROGRESS',
  'VEHICLE_MAINTENANCE_SCHEDULED',
  'VEHICLE_MAINTENANCE_OVERDUE',
  'VEHICLE_UNAVAILABLE_MAINTENANCE',
  'VEHICLE_TIRE_NEAR_REPLACEMENT',
  'VEHICLE_FUEL_ODOMETER_REGRESSION',
  'TRIP_OCCURRENCE_CRITICAL',
  'VEHICLE_OCCURRENCE_CRITICAL',
];

export class FleetAlertEntity {
  @ApiProperty({ enum: FLEET_ALERT_TYPES })
  type!: FleetAlertType;

  @ApiProperty({ enum: ['INFO', 'ATTENTION', 'CRITICAL'] })
  severity!: FleetAlertSeverity;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty()
  plate!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty({ nullable: true, description: 'Valor numerico associado ao alerta (custo, quantidade, minutos), quando aplicavel.' })
  value!: number | null;
}
