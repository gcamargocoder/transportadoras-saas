import { BiPeriodSnapshot } from './kpi.types';

// Snapshot "vazio" (tudo zero, sem distancia). Usado para descobrir as
// fontes de evidencia de um KPI e, na serie temporal, como valor das partes
// NAO exigidas pelos KPIs pedidos (nunca lidas -- ver kpi-catalog.spec).
export const EMPTY_SNAPSHOT: BiPeriodSnapshot = {
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
