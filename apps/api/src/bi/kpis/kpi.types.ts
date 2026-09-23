import { FleetCostTotals, FleetRevenueTotals } from '../../fleet-operations/services/fleet-operations-metrics.service';
import { FleetTimeTotals } from '../utils/fleet-time.util';
import { KpiPeriod } from '../utils/kpi-period.util';

export const KPI_UNITS = ['BRL', 'BRL_PER_KM', 'KM', 'LITERS', 'COUNT', 'PERCENT', 'HOURS'] as const;
export type KpiUnit = (typeof KPI_UNITS)[number];

export const KPI_CATEGORIES = ['FINANCIAL', 'OPERATIONAL', 'FLEET', 'SERVICE_LEVEL'] as const;
export type KpiCategory = (typeof KPI_CATEGORIES)[number];

// Leitura do KPI para alertas/tendencias/IA futuros: se subir e bom, ruim
// ou neutro. Nunca usado para calcular nada.
export const KPI_DIRECTIONS = ['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'NEUTRAL'] as const;
export type KpiDirection = (typeof KPI_DIRECTIONS)[number];

// Origem dos registros de evidencia. Os "listaveis" tem drill-down de
// registro (GET /bi/kpis/:kpiId/evidence); FLEET_TIME e derivado (intervalos
// de viagem/manutencao) e so expoe a contagem.
export const KPI_EVIDENCE_SOURCES = [
  'TRIP_REVENUE',
  'FUEL_SUPPLY',
  'VEHICLE_MAINTENANCE',
  'TIRE_PURCHASE',
  'TIRE_RETREAD',
  'TOLL_TRANSACTION',
  'TRIP_EXPENSE_OTHER',
  'TRIP_COMPLETED',
  'DELIVERY_COMPLETED',
  'TRIP_OCCURRENCE',
  'FLEET_TIME',
] as const;
export type KpiEvidenceSource = (typeof KPI_EVIDENCE_SOURCES)[number];

export const LISTABLE_EVIDENCE_SOURCES: readonly KpiEvidenceSource[] = KPI_EVIDENCE_SOURCES.filter(
  (s) => s !== 'FLEET_TIME',
);

// Dados BRUTOS de um periodo (um por periodo apurado/comparado). Tudo que
// um KPI precisa vem daqui -- o calculo do KPI e uma funcao pura sobre o
// snapshot, entao o mesmo KPI nunca tem duas implementacoes.
export interface BiPeriodSnapshot {
  period: KpiPeriod;
  revenue: FleetRevenueTotals;
  costs: FleetCostTotals;
  trips: { completed: number };
  deliveries: { completed: number; withDeadline: number; onTime: number };
  occurrences: { total: number; critical: number };
  fleetTime: FleetTimeTotals;
}

export interface KpiSource {
  entity: string;
  field: string;
  dateField: string;
  rule: string;
}

export interface KpiInput {
  key: string;
  label: string;
  value: number | null;
  unit: KpiUnit;
}

export interface KpiEvidenceCount {
  source: KpiEvidenceSource;
  recordCount: number;
}

export interface KpiComputation {
  /// null => indisponivel (unavailableReason obrigatorio).
  value: number | null;
  unavailableReason?: string;
  inputs: KpiInput[];
  evidence: KpiEvidenceCount[];
}

export interface KpiDefinition {
  id: string;
  name: string;
  description: string;
  category: KpiCategory;
  unit: KpiUnit;
  direction: KpiDirection;
  formula: string;
  sources: KpiSource[];
  dimensions: string[];
  limitations: string[];
  compute: (snapshot: BiPeriodSnapshot) => KpiComputation;
}
