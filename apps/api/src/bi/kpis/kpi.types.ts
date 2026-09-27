import { FleetCostTotals, FleetRevenueTotals } from '../../fleet-operations/services/fleet-operations-metrics.service';
import { FleetTimeTotals } from '../utils/fleet-time.util';
import { KpiPeriod } from '../utils/kpi-period.util';

export const KPI_UNITS = ['BRL', 'BRL_PER_KM', 'BRL_PER_LITER', 'KM', 'LITERS', 'COUNT', 'PERCENT', 'HOURS'] as const;
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
// BI 6 (Fase 6, Gestao de Combustivel) -- fontes do LEDGER do tanque
// (FuelTankMovement/FuelTankInventoryCheck), distintas de FUEL_SUPPLY
// (consumo do veiculo). FUEL_TANK_STOCK_SNAPSHOT e a evidencia de
// fuel_tank_stock: 1 registro por tanque (a ultima movimentacao ate o fim
// do periodo que determinou o saldo), nunca a lista de movimentacoes do
// periodo inteiro (o saldo nao e uma soma de eventos do periodo).
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
  'FUEL_TANK_RECEIPT',
  'FUEL_TANK_INTERNAL_FUELING',
  'FUEL_TANK_ADJUSTMENT',
  'FUEL_TANK_INVENTORY_CHECK',
  'FUEL_TANK_STOCK_SNAPSHOT',
] as const;
export type KpiEvidenceSource = (typeof KPI_EVIDENCE_SOURCES)[number];

export const LISTABLE_EVIDENCE_SOURCES: readonly KpiEvidenceSource[] = KPI_EVIDENCE_SOURCES.filter(
  (s) => s !== 'FLEET_TIME',
);

// Fase 6 (Gestao de Combustivel) -- dados BRUTOS do ledger do tanque
// (FuelTankMovement/FuelTankInventoryCheck) para um periodo. Fonte
// SEPARADA de `costs.fuelCost`/`fuelLiters` (FuelSupply, consumo do
// veiculo): FuelTank e o estoque PROPRIO da empresa, nunca reconciliado
// aqui com o consumo (ver limitations dos KPIs fuel_*).
export interface FuelTankSnapshot {
  /// Soma, entre os tanques do escopo, da ultima FuelTankMovement.newBalanceLiters
  /// com effectiveDate <= fim do periodo. null quando NENHUM tanque do escopo
  /// tem movimentacao ate a data -- nunca 0 inventado. Ponto no tempo, NUNCA
  /// somado entre periodos (comparacao = saldo x saldo).
  stockAtEnd: number | null;
  /// Tanques do escopo (independente de status ou de ter saldo apurado).
  tanksConsidered: number;
  receivedLiters: number;
  receiptCount: number;
  receivedCost: number;
  /// Media PONDERADA pelo volume, so dos RECEIPTs com pricePerLiter
  /// informado. null quando nenhum recebimento do periodo tem preco.
  averagePurchasePrice: number | null;
  pricedReceiptLiters: number;
  internalLiters: number;
  internalFuelingCount: number;
  /// Soma COM SINAL dos ADJUSTMENT (positivo = sobra, negativo = falta).
  adjustmentLitersNet: number;
  adjustmentCount: number;
  /// RECEIPT + INTERNAL_FUELING + ADJUSTMENT -- exclui INITIAL_BALANCE
  /// (evento unico de criacao do tanque, nao uma movimentacao recorrente).
  movementsCount: number;
  /// Soma COM SINAL de FuelTankInventoryCheck.divergenceLiters.
  reconciliationDivergenceLiters: number;
  reconciliationChecksCount: number;
}

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
  fuelTank: FuelTankSnapshot;
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

// BI 3 -- partes do snapshot que um KPI le. A serie temporal coleta, por
// balde, SO as partes exigidas pelos KPIs pedidos (as demais ficam vazias e
// nunca sao lidas -- garantido por teste no catalogo).
export const SNAPSHOT_PARTS = ['revenue', 'costs', 'distance', 'trips', 'deliveries', 'occurrences', 'fleetTime', 'fuelTank'] as const;
export type SnapshotPart = (typeof SNAPSHOT_PARTS)[number];

// BI 3 -- dimensoes de recorte. period/vehicle/fleet valem para todo KPI;
// customer so para KPIs cuja fonte tem vinculo direto e confiavel com
// cliente (hoje: receita, via TripRevenue.customerId). BI 8 -- type/severity
// so para occurrences_total/occurrences_critical (categoria/severidade sao
// campos intrinsecos de TripOccurrence, nunca nulos).
// BI 6 -- "tank" so para os KPIs do ledger de tanque (fuel_*): recorte por
// FuelTank.id, ou breakdown comparando todos os tanques do tenant.
export const KPI_DIMENSIONS = ['period', 'vehicle', 'fleet', 'customer', 'type', 'severity', 'tank'] as const;
export type KpiDimension = (typeof KPI_DIMENSIONS)[number];

export interface KpiDefinition {
  id: string;
  name: string;
  description: string;
  category: KpiCategory;
  unit: KpiUnit;
  direction: KpiDirection;
  formula: string;
  sources: KpiSource[];
  dimensions: KpiDimension[];
  limitations: string[];
  /// BI 3 -- true quando a soma dos pontos da serie = valor do periodo
  /// inteiro (somas/contagens). Razoes, distancia por odometro e
  /// percentuais nao sao somaveis.
  additive: boolean;
  requires: readonly SnapshotPart[];
  compute: (snapshot: BiPeriodSnapshot) => KpiComputation;
}
