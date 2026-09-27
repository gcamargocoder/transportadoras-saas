import {
  KpiComparisonEntity,
  KpiDefinitionEntity,
  KpiEvidenceEntity,
  KpiPeriodEntity,
  KpiResultEntity,
} from '../entities/bi-kpi.entity';
import {
  BiPeriodSnapshot,
  KpiComputation,
  KpiDefinition,
  KpiEvidenceSource,
  LISTABLE_EVIDENCE_SOURCES,
} from '../kpis/kpi.types';
import { computeVariation, KpiPeriod } from './kpi-period.util';

// BI 1 -- montagem PURA dos resultados a partir dos snapshots. O mesmo
// `compute` do catalogo roda para o periodo atual e para o de comparacao
// -- nunca duas implementacoes do mesmo KPI.

const EVIDENCE_LABELS: Record<KpiEvidenceSource, string> = {
  TRIP_REVENUE: 'Receitas de viagem',
  FUEL_SUPPLY: 'Abastecimentos',
  VEHICLE_MAINTENANCE: 'Ordens de servico de manutencao',
  TIRE_PURCHASE: 'Compras de pneu',
  TIRE_RETREAD: 'Recapagens',
  TOLL_TRANSACTION: 'Transacoes de pedagio',
  TRIP_EXPENSE_OTHER: 'Outras despesas de viagem',
  TRIP_COMPLETED: 'Viagens concluidas',
  DELIVERY_COMPLETED: 'Entregas concluidas',
  TRIP_OCCURRENCE: 'Ocorrencias de viagem',
  FLEET_TIME: 'Intervalos de viagem/ociosidade considerados',
  FUEL_TANK_RECEIPT: 'Recebimentos de diesel no tanque',
  FUEL_TANK_INTERNAL_FUELING: 'Abastecimentos internos do tanque',
  FUEL_TANK_ADJUSTMENT: 'Ajustes de estoque do tanque',
  FUEL_TANK_INVENTORY_CHECK: 'Conferencias fisicas de estoque',
  FUEL_TANK_STOCK_SNAPSHOT: 'Ultima movimentacao considerada no saldo de cada tanque',
};

function toPeriodEntity(period: KpiPeriod): KpiPeriodEntity {
  const entity = new KpiPeriodEntity();
  entity.start = period.start;
  entity.end = period.end;
  return entity;
}

export { toPeriodEntity };

export function toKpiDefinitionEntity(definition: KpiDefinition): KpiDefinitionEntity {
  const entity = new KpiDefinitionEntity();
  assignDefinition(entity, definition);
  return entity;
}

function assignDefinition(entity: KpiDefinitionEntity, d: KpiDefinition): void {
  entity.id = d.id;
  entity.name = d.name;
  entity.description = d.description;
  entity.category = d.category;
  entity.unit = d.unit;
  entity.direction = d.direction;
  entity.formula = d.formula;
  entity.sources = d.sources.map((s) => ({ ...s }));
  entity.dimensions = [...d.dimensions];
  entity.limitations = [...d.limitations];
  entity.additive = d.additive;
}

// BI 3 -- dimensoes pedidas alem de period (sempre aceito). vehicle/fleet
// eram aceitos incondicionalmente ate a Fase 6: todo KPI ate entao tinha
// vinculo direto com veiculo/frota. Os KPIs de tanque (fuel_tank_stock,
// fuel_received_liters etc.) nao tem esse vinculo (RECEIPT/ADJUSTMENT/
// INITIAL_BALANCE nunca gravam veiculo) -- por isso passaram a declarar
// `dimensions` explicitamente, e vehicle/fleet/tank agora sao verificados
// como customer ja era.
export interface RequestedDimensions {
  customer?: boolean;
  vehicle?: boolean;
  fleet?: boolean;
  tank?: boolean;
}

// Motivo quando o KPI nao suporta um recorte pedido: melhor indisponivel que
// misturar escopos (ex: receita do cliente - custo da frota inteira).
export function unsupportedDimensionReason(definition: KpiDefinition, requested: RequestedDimensions): string | null {
  if (requested.customer && !definition.dimensions.includes('customer')) {
    return 'Este indicador nao suporta recorte por cliente: suas fontes nao tem vinculo direto com cliente.';
  }
  if ((requested.vehicle || requested.fleet) && !definition.dimensions.includes('vehicle') && !definition.dimensions.includes('fleet')) {
    return 'Este indicador nao suporta recorte por veiculo/frota: seus dados nao tem vinculo direto com veiculo.';
  }
  if (requested.tank && !definition.dimensions.includes('tank')) {
    return 'Este indicador nao suporta recorte por tanque.';
  }
  return null;
}

// Resultado de um KPI num periodo. Recorte nao suportado => indisponivel,
// sem executar a formula sobre um snapshot de escopo misto.
export function computeKpi(
  definition: KpiDefinition,
  snapshot: BiPeriodSnapshot,
  requested: RequestedDimensions = {},
): KpiComputation {
  const reason = unsupportedDimensionReason(definition, requested);
  if (reason) return { value: null, unavailableReason: reason, inputs: [], evidence: [] };
  return definition.compute(snapshot);
}

export function toEvidenceEntities(computed: KpiComputation): KpiEvidenceEntity[] {
  return computed.evidence.map((e) => {
    const evidence = new KpiEvidenceEntity();
    evidence.source = e.source;
    evidence.label = EVIDENCE_LABELS[e.source];
    evidence.recordCount = e.recordCount;
    evidence.listable = LISTABLE_EVIDENCE_SOURCES.includes(e.source);
    return evidence;
  });
}

export function buildKpiResult(
  definition: KpiDefinition,
  current: BiPeriodSnapshot,
  comparison: BiPeriodSnapshot | null,
  requested: RequestedDimensions = {},
): KpiResultEntity {
  const computed = computeKpi(definition, current, requested);

  const entity = new KpiResultEntity();
  assignDefinition(entity, definition);
  entity.status = computed.value === null ? 'UNAVAILABLE' : 'AVAILABLE';
  entity.unavailableReason = computed.value === null ? (computed.unavailableReason ?? 'Dados insuficientes.') : null;
  entity.value = computed.value;
  entity.period = toPeriodEntity(current.period);
  entity.inputs = computed.inputs.map((i) => ({ ...i }));
  entity.evidence = toEvidenceEntities(computed);

  if (comparison) {
    const previous = computeKpi(definition, comparison, requested);
    const variation = computeVariation(computed.value, previous.value);
    const comparisonEntity = new KpiComparisonEntity();
    comparisonEntity.period = toPeriodEntity(comparison.period);
    comparisonEntity.value = previous.value;
    comparisonEntity.absoluteChange = variation.absoluteChange;
    comparisonEntity.percentChange = variation.percentChange;
    comparisonEntity.unavailableReason =
      previous.value === null ? (previous.unavailableReason ?? 'Dados insuficientes.') : null;
    entity.comparison = comparisonEntity;
  } else {
    entity.comparison = null;
  }

  return entity;
}

export function buildKpiResults(
  definitions: readonly KpiDefinition[],
  current: BiPeriodSnapshot,
  comparison: BiPeriodSnapshot | null,
  requested: RequestedDimensions = {},
): KpiResultEntity[] {
  return definitions.map((d) => buildKpiResult(d, current, comparison, requested));
}
