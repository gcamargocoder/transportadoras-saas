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

interface CostVehicleRow {
  vehicleId: string | null;
  amount: number;
  count: number;
}

function toCostRows<T>(
  groups: T[],
  vehicleIdOf: (g: T) => string | null,
  amountOf: (g: T) => number,
  countOf: (g: T) => number,
): CostVehicleRow[] {
  return groups.map((g) => ({ vehicleId: vehicleIdOf(g), amount: amountOf(g), count: countOf(g) }));
}

// BI 5 -- funde N listas de {vehicleId, amount, count} (uma por fonte de
// custo) num unico mapa por veiculo -- operating_cost soma as 5 categorias
// ao mesmo tempo; os KPIs de categoria unica passam uma lista so.
function mergeCostRows(...lists: CostVehicleRow[][]): Map<string | null, { amount: number; count: number }> {
  const merged = new Map<string | null, { amount: number; count: number }>();
  for (const list of lists) {
    for (const row of list) {
      const current = merged.get(row.vehicleId) ?? { amount: 0, count: 0 };
      merged.set(row.vehicleId, { amount: current.amount + row.amount, count: current.count + row.count });
    }
  }
  return merged;
}

// BI 5 -- projeta {vehicleId|null -> {amount,count}} nas linhas de um KPI de
// custo (sempre somavel, NUNCA UNAVAILABLE por veiculo -- ausencia de
// registro e gasto zero real): cada veiculo do escopo entra com o valor
// conhecido (0 quando nao ha registro); o que sobra da fusao vira "Veiculo
// removido" (historico de veiculo excluido) ou "Sem veiculo" (despesa/pneu
// sem vinculo a um veiculo especifico) -- nunca descartado silenciosamente.
function costRawRows(
  vehicles: { vehicleId: string; plate: string }[],
  merged: Map<string | null, { amount: number; count: number }>,
): RawVehicleRow[] {
  const remaining = new Map(merged);
  const raw: RawVehicleRow[] = vehicles.map((v) => {
    const entry = remaining.get(v.vehicleId);
    remaining.delete(v.vehicleId);
    return { vehicleId: v.vehicleId, label: v.plate, value: entry?.amount ?? 0, recordCount: entry?.count ?? 0, unavailableReason: null };
  });
  const unassigned = remaining.get(null);
  remaining.delete(null);
  if (unassigned) {
    raw.push({ vehicleId: null, label: UNASSIGNED_VEHICLE_LABEL, value: unassigned.amount, recordCount: unassigned.count, unavailableReason: null });
  }
  if (remaining.size > 0) {
    let amount = 0;
    let count = 0;
    for (const entry of remaining.values()) {
      amount += entry.amount;
      count += entry.count;
    }
    raw.push({ vehicleId: null, label: REMOVED_VEHICLE_LABEL, value: amount, recordCount: count, unavailableReason: null });
  }
  return raw;
}

// BI 4 -- motivos por veiculo, mesma regra dos KPIs agregados equivalentes
// (NO_FLEET_CAPACITY/NO_DISTANCE no catalogo), so que aplicada por linha.
const VEHICLE_OUT_OF_OPERATION =
  'Veiculo fora de operacao (status atual) ou fora do periodo de cadastro no intervalo pedido.';
const NO_DISTANCE_VEHICLE =
  'Menos de 2 leituras de odometro (abastecimento ou manutencao) no periodo para este veiculo.';
const REMOVED_VEHICLE_LABEL = 'Veiculo removido';
// Trip.composition e opcional no schema (BI 4): uma viagem pode chegar a
// COMPLETED sem composicao. Reaproveitado no BI 5 para TripExpense/Tire sem
// vehicleId (despesa geral da empresa ou pneu em estoque no momento da
// compra) -- em ambos os casos o registro e real e nunca some do total.
const UNASSIGNED_VEHICLE_LABEL = 'Sem veiculo';

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

  // BI 4/5 -- reusa a MESMA funcao pura do catalogo (findKpiDefinition(id)
  // .compute) para o "total" de uma razao -- nunca uma segunda formula de
  // utilizacao/disponibilidade da frota ou de custo/km.
  private catalogTotal(kpiId: string, snapshot: Partial<BiPeriodSnapshot>, period: KpiPeriod): number | null {
    const definition = findKpiDefinition(kpiId);
    if (!definition) return null;
    const full: BiPeriodSnapshot = { ...EMPTY_SNAPSHOT, period, ...snapshot };
    return definition.compute(full).value;
  }

  private ratioTotal(kpiId: 'fleet_utilization' | 'fleet_availability', aggregate: FleetTimeTotals, period: KpiPeriod): number | null {
    return this.catalogTotal(kpiId, { fleetTime: aggregate }, period);
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
      // pode sumir do total (ver UNASSIGNED_VEHICLE_LABEL acima).
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
      raw.push({ vehicleId: null, label: UNASSIGNED_VEHICLE_LABEL, value: noCompositionCount, recordCount: noCompositionCount, unavailableReason: null });
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

  // --------------------------------------------------------------------------
  // BI 5 -- custo por veiculo
  // --------------------------------------------------------------------------

  // Veiculos do escopo, sem carregar viagens/manutencoes (o BI 4 usa
  // loadVehicleIdleData porque precisa delas; custo so precisa de id+placa).
  private async listScopedVehicles(tenantId: string, scope: BiScope): Promise<{ vehicleId: string; plate: string }[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { tenantId, deletedAt: null, ...compact({ id: scope.vehicleId, fleetId: scope.fleetId }) },
      select: { id: true, plate: true },
    });
    return vehicles.map((v) => ({ vehicleId: v.id, plate: v.plate }));
  }

  // BI 5 -- as 5 fontes de custo REALIZADO agrupadas por veiculo, com o MESMO
  // where de FleetOperationsMetricsService.buildCostSourceWheres (o mesmo do
  // summary/evidencias) -- nenhuma query nem formula nova, so groupBy em vez
  // de aggregate. TireRetread nao tem vehicleId direto: atribuido ao veiculo
  // ATUAL do pneu, mesma limitacao ja documentada no catalogo para tire_cost.
  private async loadCostSourceRows(tenantId: string, scope: BiScope, period: KpiPeriod) {
    const filters = compact({ startDate: period.start, endDate: period.end, ...scope });
    const wheres = this.fleetMetrics.buildCostSourceWheres(tenantId, filters);
    const [fuelGroups, maintenanceGroups, tollGroups, tireGroups, retreads, otherGroups] = await Promise.all([
      this.prisma.fuelSupply.groupBy({ by: ['vehicleId'], where: wheres.fuel, _sum: { totalAmount: true }, _count: true }),
      this.prisma.vehicleMaintenance.groupBy({ by: ['vehicleId'], where: wheres.maintenance, _sum: { totalCost: true }, _count: true }),
      this.prisma.tollTransaction.groupBy({ by: ['vehicleId'], where: wheres.toll, _sum: { chargedAmount: true }, _count: true }),
      this.prisma.tire.groupBy({ by: ['vehicleId'], where: wheres.tire, _sum: { purchasePrice: true }, _count: true }),
      this.prisma.tireRetread.findMany({ where: wheres.retread, select: { cost: true, tire: { select: { vehicleId: true } } } }),
      this.prisma.tripExpense.groupBy({ by: ['vehicleId'], where: wheres.otherExpense, _sum: { amount: true }, _count: true }),
    ]);

    const fuel = toCostRows(fuelGroups, (g) => g.vehicleId, (g) => toNumberOrNull(g._sum.totalAmount) ?? 0, (g) => g._count);
    const maintenance = toCostRows(maintenanceGroups, (g) => g.vehicleId, (g) => toNumberOrNull(g._sum.totalCost) ?? 0, (g) => g._count);
    const toll = toCostRows(tollGroups, (g) => g.vehicleId, (g) => toNumberOrNull(g._sum.chargedAmount) ?? 0, (g) => g._count);
    const tirePurchases = toCostRows(tireGroups, (g) => g.vehicleId, (g) => toNumberOrNull(g._sum.purchasePrice) ?? 0, (g) => g._count);
    const other = toCostRows(otherGroups, (g) => g.vehicleId, (g) => toNumberOrNull(g._sum.amount) ?? 0, (g) => g._count);

    const retreadByVehicle = new Map<string | null, { amount: number; count: number }>();
    for (const r of retreads) {
      const vehicleId = r.tire?.vehicleId ?? null;
      const current = retreadByVehicle.get(vehicleId) ?? { amount: 0, count: 0 };
      retreadByVehicle.set(vehicleId, { amount: current.amount + (toNumberOrNull(r.cost) ?? 0), count: current.count + 1 });
    }
    const tire: CostVehicleRow[] = [
      ...tirePurchases,
      ...[...retreadByVehicle.entries()].map(([vehicleId, v]) => ({ vehicleId, amount: v.amount, count: v.count })),
    ];

    return { fuel, maintenance, toll, tire, other };
  }

  async fuelCostByVehicle(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const [vehicles, sources] = await Promise.all([this.listScopedVehicles(tenantId, scope), this.loadCostSourceRows(tenantId, scope, period)]);
    return summableVehicleBreakdown(costRawRows(vehicles, mergeCostRows(sources.fuel)), limit);
  }

  async maintenanceCostByVehicle(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const [vehicles, sources] = await Promise.all([this.listScopedVehicles(tenantId, scope), this.loadCostSourceRows(tenantId, scope, period)]);
    return summableVehicleBreakdown(costRawRows(vehicles, mergeCostRows(sources.maintenance)), limit);
  }

  async tollCostByVehicle(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const [vehicles, sources] = await Promise.all([this.listScopedVehicles(tenantId, scope), this.loadCostSourceRows(tenantId, scope, period)]);
    return summableVehicleBreakdown(costRawRows(vehicles, mergeCostRows(sources.toll)), limit);
  }

  async tireCostByVehicle(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const [vehicles, sources] = await Promise.all([this.listScopedVehicles(tenantId, scope), this.loadCostSourceRows(tenantId, scope, period)]);
    return summableVehicleBreakdown(costRawRows(vehicles, mergeCostRows(sources.tire)), limit);
  }

  async otherCostByVehicle(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const [vehicles, sources] = await Promise.all([this.listScopedVehicles(tenantId, scope), this.loadCostSourceRows(tenantId, scope, period)]);
    return summableVehicleBreakdown(costRawRows(vehicles, mergeCostRows(sources.other)), limit);
  }

  // operating_cost por veiculo = soma das 5 categorias por veiculo (MESMAS
  // linhas ja carregadas por loadCostSourceRows) -- nunca uma segunda soma
  // paralela do total.
  async operatingCostByVehicle(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const [vehicles, sources] = await Promise.all([this.listScopedVehicles(tenantId, scope), this.loadCostSourceRows(tenantId, scope, period)]);
    const merged = mergeCostRows(sources.fuel, sources.maintenance, sources.toll, sources.tire, sources.other);
    return summableVehicleBreakdown(costRawRows(vehicles, merged), limit);
  }

  // cost_per_km e uma razao (como fleet_utilization/fleet_availability):
  // nunca somada entre veiculos. "total" e o valor OFICIAL do KPI (mesma
  // funcao pura do catalogo); share/others ficam sempre null. So entram
  // veiculos com distancia qualificada (>= 2 leituras), mesma regra do
  // ranking de custo/km ja existente em FleetOperationsMetricsService.
  async costPerKmByVehicle(tenantId: string, scope: BiScope, period: KpiPeriod, limit: number): Promise<BreakdownResult> {
    const filters = compact({ startDate: period.start, endDate: period.end, ...scope });
    const [vehicles, sources, costs] = await Promise.all([
      this.listScopedVehicles(tenantId, scope),
      this.loadCostSourceRows(tenantId, scope, period),
      this.fleetMetrics.computeCostTotals(tenantId, filters, { includeDistance: true }),
    ]);
    const merged = mergeCostRows(sources.fuel, sources.maintenance, sources.toll, sources.tire, sources.other);
    const distances = costs.distance?.vehicleDistances ?? new Map<string, number>();
    const items = vehicles
      .map((v) => {
        const cost = merged.get(v.vehicleId)?.amount ?? 0;
        const distanceKm = distances.get(v.vehicleId) ?? null;
        const value = distanceKm !== null && distanceKm > 0 ? cost / distanceKm : null;
        return item(v.vehicleId, v.plate, value, merged.get(v.vehicleId)?.count ?? 0, null, value === null ? NO_DISTANCE_VEHICLE : null);
      })
      .sort(byValueDesc);
    const snapshot: Partial<BiPeriodSnapshot> = { costs };
    return { total: this.catalogTotal('cost_per_km', snapshot, period), items: items.slice(0, limit), others: null };
  }
}
