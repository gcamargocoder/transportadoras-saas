import {
  KpiComparisonEntity,
  KpiDefinitionEntity,
  KpiEvidenceEntity,
  KpiPeriodEntity,
  KpiResultEntity,
} from '../entities/bi-kpi.entity';
import { BiPeriodSnapshot, KpiDefinition, KpiEvidenceSource, LISTABLE_EVIDENCE_SOURCES } from '../kpis/kpi.types';
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
};

function toPeriodEntity(period: KpiPeriod): KpiPeriodEntity {
  const entity = new KpiPeriodEntity();
  entity.start = period.start;
  entity.end = period.end;
  return entity;
}

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
}

export function buildKpiResult(
  definition: KpiDefinition,
  current: BiPeriodSnapshot,
  comparison: BiPeriodSnapshot | null,
): KpiResultEntity {
  const computed = definition.compute(current);

  const entity = new KpiResultEntity();
  assignDefinition(entity, definition);
  entity.status = computed.value === null ? 'UNAVAILABLE' : 'AVAILABLE';
  entity.unavailableReason = computed.value === null ? (computed.unavailableReason ?? 'Dados insuficientes.') : null;
  entity.value = computed.value;
  entity.period = toPeriodEntity(current.period);
  entity.inputs = computed.inputs.map((i) => ({ ...i }));
  entity.evidence = computed.evidence.map((e) => {
    const evidence = new KpiEvidenceEntity();
    evidence.source = e.source;
    evidence.label = EVIDENCE_LABELS[e.source];
    evidence.recordCount = e.recordCount;
    evidence.listable = LISTABLE_EVIDENCE_SOURCES.includes(e.source);
    return evidence;
  });

  if (comparison) {
    const previous = definition.compute(comparison);
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
): KpiResultEntity[] {
  return definitions.map((d) => buildKpiResult(d, current, comparison));
}
