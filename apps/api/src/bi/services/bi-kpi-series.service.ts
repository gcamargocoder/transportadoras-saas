import { Injectable } from '@nestjs/common';
import { KpiSeriesEntity, KpiSeriesPointEntity } from '../entities/bi-kpi.entity';
import { BiPeriodSnapshot, KpiDefinition, SnapshotPart } from '../kpis/kpi.types';
import { BiScope } from '../utils/bi-where.util';
import { computeKpi, RequestedDimensions, toEvidenceEntities, toKpiDefinitionEntity } from '../utils/build-kpi-results.util';
import { KpiBucket } from '../utils/kpi-buckets.util';
import { BiKpiSnapshotService } from './bi-kpi-snapshot.service';

// Uniao das partes exigidas pelos KPIs pedidos: cada balde busca so isso.
export function requiredParts(definitions: readonly KpiDefinition[]): SnapshotPart[] {
  return [...new Set(definitions.flatMap((d) => d.requires))];
}

function toPoint(
  definition: KpiDefinition,
  bucket: KpiBucket,
  snapshot: BiPeriodSnapshot,
  requested: RequestedDimensions,
): KpiSeriesPointEntity {
  const computed = computeKpi(definition, snapshot, requested);
  const point = new KpiSeriesPointEntity();
  point.label = bucket.label;
  point.start = bucket.start;
  point.end = bucket.end;
  point.partial = bucket.partial;
  point.status = computed.value === null ? 'UNAVAILABLE' : 'AVAILABLE';
  point.value = computed.value;
  point.unavailableReason = computed.value === null ? (computed.unavailableReason ?? 'Dados insuficientes.') : null;
  point.inputs = computed.inputs.map((i) => ({ ...i }));
  point.evidence = toEvidenceEntities(computed);
  return point;
}

// BI 3 -- serie temporal dos KPIs. Cada balde vira um periodo comum e passa
// pelo MESMO coletor + MESMO `compute` do catalogo usados por
// /bi/kpis/summary: nao existe formula de grafico. Os KPIs pedidos
// compartilham o snapshot de cada balde (uma coleta por balde, nao por KPI).
@Injectable()
export class BiKpiSeriesService {
  constructor(private readonly snapshots: BiKpiSnapshotService) {}

  async build(
    tenantId: string,
    scope: BiScope,
    definitions: readonly KpiDefinition[],
    buckets: KpiBucket[],
    comparisonBuckets: KpiBucket[] | null,
    requested: RequestedDimensions,
    now: Date,
  ): Promise<KpiSeriesEntity[]> {
    const parts = requiredParts(definitions);
    const allBuckets = [...buckets, ...(comparisonBuckets ?? [])];
    const snapshots = await this.snapshots.collect(tenantId, scope, allBuckets, now, parts);
    const current = snapshots.slice(0, buckets.length);
    const previous = comparisonBuckets ? snapshots.slice(buckets.length) : null;

    return definitions.map((definition) => {
      const entity = Object.assign(new KpiSeriesEntity(), toKpiDefinitionEntity(definition));
      entity.points = buckets.map((bucket, i) => toPoint(definition, bucket, current[i] as BiPeriodSnapshot, requested));
      entity.comparisonPoints =
        comparisonBuckets && previous
          ? comparisonBuckets.map((bucket, i) => toPoint(definition, bucket, previous[i] as BiPeriodSnapshot, requested))
          : null;
      return entity;
    });
  }
}
