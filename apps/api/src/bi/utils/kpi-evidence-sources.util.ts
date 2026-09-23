import { BiPeriodSnapshot, KpiDefinition, KpiEvidenceSource } from '../kpis/kpi.types';

// Snapshot "vazio" (tudo zero/sem distancia) -- usado so para descobrir
// quais fontes de evidencia um KPI declara. As fontes de evidencia de um KPI
// nunca dependem dos valores, apenas da formula; derivar daqui evita manter
// uma segunda lista paralela ao `compute` do catalogo.
const EMPTY_SNAPSHOT: BiPeriodSnapshot = {
  period: { start: new Date(0), end: new Date(0) },
  revenue: { totalRevenue: 0, recordCount: 0 },
  costs: {
    fuelCost: 0,
    maintenanceCost: 0,
    tireCost: 0,
    tollCost: 0,
    otherCost: 0,
    totalCost: 0,
    fuelLiters: 0,
    otherCostByCategory: [],
    recordCounts: { fuelSupplies: 0, maintenances: 0, tires: 0, tireRetreads: 0, tollTransactions: 0, otherExpenses: 0 },
    distance: null,
  },
  trips: { completed: 0 },
  deliveries: { completed: 0, withDeadline: 0, onTime: 0 },
  occurrences: { total: 0, critical: 0 },
  fleetTime: {
    vehiclesConsidered: 0,
    capacityMinutes: 0,
    tripMinutes: 0,
    maintenanceMinutes: 0,
    idleNetMinutes: 0,
    tripsConsidered: 0,
    idleSegmentsConsidered: 0,
    effectiveEnd: new Date(0),
  },
};

export function evidenceSourcesOf(definition: KpiDefinition): KpiEvidenceSource[] {
  return [...new Set(definition.compute(EMPTY_SNAPSHOT).evidence.map((e) => e.source))];
}
