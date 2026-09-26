import { Injectable } from '@nestjs/common';
import { compact } from '../../common/utils/compact.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { FleetIdleTimeService } from '../../fleet-operations/services/fleet-idle-time.service';
import { FleetOperationsMetricsService } from '../../fleet-operations/services/fleet-operations-metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KpiBreakdownItemEntity } from '../entities/bi-kpi.entity';
import { EMPTY_SNAPSHOT } from '../kpis/empty-snapshot';
import { findKpiDefinition } from '../kpis/kpi-catalog';
import { BiPeriodSnapshot } from '../kpis/kpi.types';
import { BiScope, buildCompletedTripWhere } from '../utils/bi-where.util';
import { computeFleetTimeByVehicle, computeFleetTimeTotals, FleetTimeTotals } from '../utils/fleet-time.util';
import { KpiPeriod } from '../utils/kpi-period.util';

export interface BreakdownResult {
  total: number | null;
  items: KpiBreakdownItemEntity[];
  others: KpiBreakdownItemEntity | null;
}

// key=null -- receita sem cliente, ou (BI 4) registro de veiculo ja removido
// do escopo atual. unavailableReason=null quando o item tem valor valido
// (mesmo 0, que e um valor REAL, nao um "sem dado").
function item(
  key: string | null,
  label: string,
  value: number | null,
  recordCount: number,
  shareBase: number | null,
  unavailableReason: string | null = null,
): KpiBreakdownItemEntity {
  const entity = new KpiBreakdownItemEntity();
  entity.key = key;
  entity.label = label;
  entity.value = value;
  entity.unavailableReason = unavailableReason;
  entity.recordCount = recordCount;
  entity.share = value !== null && shareBase !== null && shareBase > 0 ? (value / shareBase) * 100 : null;
  return entity;
}

function byValueDesc(a: KpiBreakdownItemEntity, b: KpiBreakdownItemEntity): number {
  if (a.value === null && b.value === null) return 0;
  if (a.value === null) return 1;
  if (b.value === null) return -1;
  return b.value - a.value || a.label.localeCompare(b.label);
}

interface RawVehicleRow {
  vehicleId: string | null;
  label: string;
  value: number | null;
  recordCount: number;
  unavailableReason: string | null;
}

// BI 4 -- monta o breakdown por veiculo de um KPI SOMAVEL (idle_hours,
// trips_completed, distance_km): total = soma dos itens com valor -- null
// (nunca 0) quando NENHUM item tem valor, o mesmo caso em que o KPI agregado
// ficaria UNAVAILABLE. Respeita "limit" agrupando o resto em "others" (mesmo
// padrao de revenueByCustomer) -- nunca trunca silenciosamente: soma(items)
// + others sempre = total.
function summableVehicleBreakdown(raw: RawVehicleRow[], limit: number): BreakdownResult {
  const withValue = raw.filter((r) => r.value !== null);
  const total = withValue.length > 0 ? withValue.reduce((sum, r) => sum + (r.value as number), 0) : null;
  const items = raw
    .map((r) => item(r.vehicleId, r.label, r.value, r.recordCount, total, r.unavailableReason))
    .sort(byValueDesc);
  const top = items.slice(0, limit);
  const rest = items.slice(limit);
  const restWithValue = rest.filter((r) => r.value !== null);
  const others =
    rest.length > 0
      ? item(
          null,
          `Demais (${rest.length})`,
          restWithValue.length > 0 ? restWithValue.reduce((sum, r) => sum + (r.value as number), 0) : null,
          rest.reduce((sum, r) => sum + r.recordCount, 0),
          total,
          restWithValue.length === 0 ? 'Nenhum veiculo restante com dado suficiente no periodo.' : null,
        )
      : null;
  return { total, items: top, others };
}

// BI 4 -- motivos por veiculo, mesma regra dos KPIs agregados equivalentes
// (NO_FLEET_CAPACITY/NO_DISTANCE no catalogo), so que aplicada por linha.
const VEHICLE_OUT_OF_OPERATION =
  'Veiculo fora de operacao (status atual) ou fora do periodo de cadastro no intervalo pedido.';
const NO_DISTANCE_VEHICLE =
  'Menos de 2 leituras de odometro (abastecimento ou manutencao) no periodo para este veiculo.';
const REMOVED_VEHICLE_LABEL = 'Veiculo removido';
// Trip.composition e opcional no schema: uma viagem pode chegar a COMPLETED
// sem composicao (assertCanStart so valida o veiculo QUANDO ha composicao).
// Essas viagens contam no summary (prisma.trip.count) e nunca podem sumir
// silenciosamente do breakdown por veiculo.
const NO_COMPOSITION_LABEL = 'Sem veiculo';

// BI 3 -- receita por cliente. O where e EXATAMENTE o do KPI `revenue`
// (FleetOperationsMetricsService.buildRevenueSourceWhere); o groupBy so
// particiona o mesmo conjunto de registros por TripRevenue.customerId --
// a soma das partes e o valor do KPI (testado no e2e). Custos nao entram:
// suas fontes nao tem vinculo direto e confiavel com cliente.
//
// BI 4 -- recorte por VEICULO dos 5 KPIs de frota, abaixo. Mesmos coletores
// do catalogo (loadVehicleIdleData, computeCostTotals, buildCompletedTripWhere)
// -- nenhuma query nem formula nova. fleet_utilization/fleet_availability sao
// razoes: "total" e o valor OFICIAL do KPI (recalculado pela mesma funcao pura
// do catalogo sobre o agregado), share e others sao sempre null para elas --
// nao existe soma/media valida de percentuais entre veiculos.
@Injectable()
export class BiKpiBreakdownService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fleetMetrics: FleetOperationsMetricsService,
    private readonly idleTime: FleetIdleTimeService,
  ) {}

  async revenueByCustomer(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const where = this.fleetMetrics.buildRevenueSourceWhere(
      tenantId,
      compact({ startDate: period.start, endDate: period.end, ...scope }),
    );
    const groups = await this.prisma.tripRevenue.groupBy({
      by: ['customerId'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });

    const rows = groups
      .map((g) => ({ customerId: g.customerId, value: toNumberOrNull(g._sum.amount) ?? 0, count: g._count._all }))
      .sort((a, b) => b.value - a.value || String(a.customerId).localeCompare(String(b.customerId)));
    const total = rows.reduce((sum, r) => sum + r.value, 0);
    const top = rows.slice(0, limit);
    const rest = rows.slice(limit);

    const ids = top.map((r) => r.customerId).filter((id): id is string => id !== null);
    const customers =
      ids.length > 0
        ? await this.prisma.customer.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true } })
        : [];
    const nameById = new Map(customers.map((c) => [c.id, c.name]));

    return {
      total,
      items: top.map((r) =>
        item(r.customerId, r.customerId ? (nameById.get(r.customerId) ?? 'Cliente removido') : 'Sem cliente', r.value, r.count, total),
      ),
      others:
        rest.length > 0
          ? item(
              null,
              `Demais (${rest.length})`,
              rest.reduce((sum, r) => sum + r.value, 0),
              rest.reduce((sum, r) => sum + r.count, 0),
              total,
            )
          : null,
    };
  }

  // --------------------------------------------------------------------------
  // BI 4 -- recorte por veiculo
  // --------------------------------------------------------------------------

  private async loadFleetTimeRows(tenantId: string, scope: BiScope, period: KpiPeriod) {
    const vehicles = await this.idleTime.loadVehicleIdleData(tenantId, scope);
    const now = new Date();
    return { vehicles, rows: computeFleetTimeByVehicle(vehicles, period, now), aggregate: computeFleetTimeTotals(vehicles, period, now) };
  }

  // Reusa a MESMA funcao pura do catalogo (findKpiDefinition(id).compute) para
  // o "total" de uma razao -- nunca uma segunda formula de utilizacao/
  // disponibilidade da frota.
  private ratioTotal(kpiId: 'fleet_utilization' | 'fleet_availability', aggregate: FleetTimeTotals, period: KpiPeriod): number | null {
    const definition = findKpiDefinition(kpiId);
    if (!definition) return null;
    const snapshot: BiPeriodSnapshot = { ...EMPTY_SNAPSHOT, period, fleetTime: aggregate };
    return definition.compute(snapshot).value;
  }

  async fleetUtilizationByVehicle(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const { vehicles, rows, aggregate } = await this.loadFleetTimeRows(tenantId, scope, period);
    const items = vehicles
      .map((v) => {
        const row = rows.get(v.vehicleId);
        const value = row?.considered ? (row.tripMinutes / row.capacityMinutes) * 100 : null;
        return item(v.vehicleId, v.plate, value, row?.tripsConsidered ?? 0, null, value === null ? VEHICLE_OUT_OF_OPERATION : null);
      })
      .sort(byValueDesc);
    return { total: this.ratioTotal('fleet_utilization', aggregate, period), items: items.slice(0, limit), others: null };
  }

  async fleetAvailabilityByVehicle(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const { vehicles, rows, aggregate } = await this.loadFleetTimeRows(tenantId, scope, period);
    const items = vehicles
      .map((v) => {
        const row = rows.get(v.vehicleId);
        const value = row?.considered ? ((row.capacityMinutes - row.maintenanceMinutes) / row.capacityMinutes) * 100 : null;
        return item(v.vehicleId, v.plate, value, row?.tripsConsidered ?? 0, null, value === null ? VEHICLE_OUT_OF_OPERATION : null);
      })
      .sort(byValueDesc);
    return { total: this.ratioTotal('fleet_availability', aggregate, period), items: items.slice(0, limit), others: null };
  }

  async idleHoursByVehicle(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const { vehicles, rows } = await this.loadFleetTimeRows(tenantId, scope, period);
    const raw: RawVehicleRow[] = vehicles.map((v) => {
      const row = rows.get(v.vehicleId);
      const value = row?.considered ? row.idleNetMinutes / 60 : null;
      return {
        vehicleId: v.vehicleId,
        label: v.plate,
        value,
        recordCount: row?.idleSegmentsConsidered ?? 0,
        unavailableReason: value === null ? VEHICLE_OUT_OF_OPERATION : null,
      };
    });
    return summableVehicleBreakdown(raw, limit);
  }

  async tripsCompletedByVehicle(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const [vehicles, trips] = await Promise.all([
      this.idleTime.loadVehicleIdleData(tenantId, scope),
      this.prisma.trip.findMany({
        where: buildCompletedTripWhere(tenantId, scope, period),
        select: { composition: { select: { vehicleId: true } } },
      }),
    ]);
    const countByVehicle = new Map<string, number>();
    let noCompositionCount = 0;
    for (const trip of trips) {
      const vehicleId = trip.composition?.vehicleId;
      // Trip.composition e opcional: viagem concluida sem composicao nunca
      // pode sumir do total (ver NO_COMPOSITION_LABEL acima).
      if (!vehicleId) {
        noCompositionCount += 1;
        continue;
      }
      countByVehicle.set(vehicleId, (countByVehicle.get(vehicleId) ?? 0) + 1);
    }
    const raw: RawVehicleRow[] = vehicles.map((v) => {
      const count = countByVehicle.get(v.vehicleId) ?? 0;
      countByVehicle.delete(v.vehicleId);
      return { vehicleId: v.vehicleId, label: v.plate, value: count, recordCount: count, unavailableReason: null };
    });
    // Viagens cujo veiculo saiu do escopo atual (removido) desde entao --
    // nunca descartadas silenciosamente: mesmo padrao de "Sem cliente".
    const orphan = [...countByVehicle.values()].reduce((sum, c) => sum + c, 0);
    if (orphan > 0) raw.push({ vehicleId: null, label: REMOVED_VEHICLE_LABEL, value: orphan, recordCount: orphan, unavailableReason: null });
    if (noCompositionCount > 0) {
      raw.push({ vehicleId: null, label: NO_COMPOSITION_LABEL, value: noCompositionCount, recordCount: noCompositionCount, unavailableReason: null });
    }
    return summableVehicleBreakdown(raw, limit);
  }

  async distanceByVehicle(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const [vehicles, costs] = await Promise.all([
      this.idleTime.loadVehicleIdleData(tenantId, scope),
      this.fleetMetrics.computeCostTotals(tenantId, compact({ startDate: period.start, endDate: period.end, ...scope }), { includeDistance: true }),
    ]);
    const distances = new Map(costs.distance?.vehicleDistances ?? []);
    const readingCounts = costs.distance?.readingCounts ?? new Map<string, number>();
    const raw: RawVehicleRow[] = vehicles.map((v) => {
      const value = distances.get(v.vehicleId) ?? null;
      distances.delete(v.vehicleId);
      return {
        vehicleId: v.vehicleId,
        label: v.plate,
        value,
        recordCount: readingCounts.get(v.vehicleId) ?? 0,
        unavailableReason: value === null ? NO_DISTANCE_VEHICLE : null,
      };
    });
    // Leituras de veiculo removido do escopo atual -- mesmo padrao acima.
    if (distances.size > 0) {
      let orphanKm = 0;
      let orphanReadings = 0;
      for (const [vehicleId, value] of distances) {
        orphanKm += value;
        orphanReadings += readingCounts.get(vehicleId) ?? 0;
      }
      raw.push({ vehicleId: null, label: REMOVED_VEHICLE_LABEL, value: orphanKm, recordCount: orphanReadings, unavailableReason: null });
    }
    return summableVehicleBreakdown(raw, limit);
  }
}
