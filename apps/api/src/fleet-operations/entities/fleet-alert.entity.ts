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
  | 'DOWNTIME_COST_OUTLIER';

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
