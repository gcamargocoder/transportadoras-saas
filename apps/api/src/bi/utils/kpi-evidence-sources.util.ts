import { EMPTY_SNAPSHOT } from '../kpis/empty-snapshot';
import { KpiDefinition, KpiEvidenceSource } from '../kpis/kpi.types';

// As fontes de evidencia de um KPI dependem da formula, nunca dos valores:
// derivar de um snapshot vazio evita uma segunda lista paralela ao compute.

export function evidenceSourcesOf(definition: KpiDefinition): KpiEvidenceSource[] {
  return [...new Set(definition.compute(EMPTY_SNAPSHOT).evidence.map((e) => e.source))];
}
