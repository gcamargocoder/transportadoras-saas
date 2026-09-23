import { Prisma, TripDeliveryStopStatus, TripOccurrenceSeverity, TripStatus } from '@prisma/client';
import { compact } from '../../common/utils/compact.util';
import { KpiPeriod } from './kpi-period.util';

// BI 1 -- where-builders das fontes que so o BI agrega (viagens concluidas,
// entregas, ocorrencias). Unico ponto de montagem: o snapshot (total) e a
// listagem de evidencias usam as MESMAS funcoes. tenantId e sempre o
// primeiro campo -- nenhuma consulta de BI existe sem ele.

export interface BiScope {
  vehicleId?: string;
  fleetId?: string;
  /// BI 3 -- so aplicado as fontes com vinculo direto a cliente (receita).
  /// KPIs sem a dimensao "customer" ficam indisponiveis quando informado.
  customerId?: string;
}

function periodRange(period: KpiPeriod): Prisma.DateTimeFilter {
  return { gte: period.start, lte: period.end };
}

// Mesmo join veiculo/frota de FleetOperationsMetricsService.buildTripWhere.
function compositionFilter(scope: BiScope): Prisma.TripCompositionWhereInput | undefined {
  const filter = compact({
    vehicleId: scope.vehicleId,
    vehicle: scope.fleetId ? { fleetId: scope.fleetId } : undefined,
  });
  return Object.keys(filter).length > 0 ? filter : undefined;
}

export function buildCompletedTripWhere(tenantId: string, scope: BiScope, period: KpiPeriod): Prisma.TripWhereInput {
  return {
    tenantId,
    deletedAt: null,
    status: TripStatus.COMPLETED,
    actualArrival: periodRange(period),
    ...compact({ composition: compositionFilter(scope) }),
  };
}

export function buildCompletedDeliveryWhere(
  tenantId: string,
  scope: BiScope,
  period: KpiPeriod,
): Prisma.TripDeliveryStopWhereInput {
  return {
    tenantId,
    status: TripDeliveryStopStatus.COMPLETED,
    deliveredAt: periodRange(period),
    trip: { deletedAt: null, ...compact({ composition: compositionFilter(scope) }) },
  };
}

export function buildOccurrenceWhere(
  tenantId: string,
  scope: BiScope,
  period: KpiPeriod,
  severity?: TripOccurrenceSeverity,
): Prisma.TripOccurrenceWhereInput {
  return {
    tenantId,
    cancelledAt: null,
    occurredAt: periodRange(period),
    trip: { deletedAt: null },
    ...compact({
      vehicleId: scope.vehicleId,
      vehicle: scope.fleetId ? { fleetId: scope.fleetId } : undefined,
      severity,
    }),
  };
}

// No prazo = chegada real (actualArrival, gravada ao entrar em IN_PROGRESS;
// na falta, deliveredAt) ate a previsao. Sem tolerancia.
export function isDeliveredOnTime(row: {
  plannedArrival: Date;
  actualArrival: Date | null;
  deliveredAt: Date | null;
}): boolean {
  const arrival = row.actualArrival ?? row.deliveredAt;
  return arrival !== null && arrival.getTime() <= row.plannedArrival.getTime();
}
