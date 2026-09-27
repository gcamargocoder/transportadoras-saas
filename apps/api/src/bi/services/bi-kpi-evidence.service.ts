import { Injectable } from '@nestjs/common';
import { FuelTankMovementType } from '@prisma/client';
import { compact } from '../../common/utils/compact.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { FleetOperationsMetricsService } from '../../fleet-operations/services/fleet-operations-metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KpiEvidenceRecordEntity } from '../entities/bi-kpi.entity';
import { KpiEvidenceSource } from '../kpis/kpi.types';
import {
  BiScope,
  buildCompletedDeliveryWhere,
  buildCompletedTripWhere,
  buildFuelTankInventoryCheckWhere,
  buildFuelTankMovementWhere,
  buildOccurrenceWhere,
} from '../utils/bi-where.util';
import { KpiPeriod } from '../utils/kpi-period.util';

interface EvidencePage {
  items: KpiEvidenceRecordEntity[];
  total: number;
}

function record(fields: Partial<KpiEvidenceRecordEntity> & { id: string }): KpiEvidenceRecordEntity {
  const entity = new KpiEvidenceRecordEntity();
  entity.id = fields.id;
  entity.date = fields.date ?? null;
  entity.amount = fields.amount ?? null;
  entity.vehicleId = fields.vehicleId ?? null;
  entity.tripId = fields.tripId ?? null;
  entity.description = fields.description ?? null;
  entity.latitude = fields.latitude ?? null;
  entity.longitude = fields.longitude ?? null;
  entity.locationLabel = fields.locationLabel ?? null;
  entity.severity = fields.severity ?? null;
  return entity;
}

// BI 1 -- KPI -> evidencias -> REGISTROS DE ORIGEM. Cada fonte usa o MESMO
// where que produziu o total do KPI (FleetOperationsMetricsService.
// buildCostSourceWheres/buildRevenueSourceWhere para custo/receita;
// bi-where.util para viagens/entregas/ocorrencias) -- a soma dos registros
// listados sempre bate com o total. Paginado no banco (skip/take + count),
// ordem estavel (data desc, id).
@Injectable()
export class BiKpiEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fleetMetrics: FleetOperationsMetricsService,
  ) {}

  async list(
    tenantId: string,
    scope: BiScope,
    period: KpiPeriod,
    source: Exclude<KpiEvidenceSource, 'FLEET_TIME'>,
    page: number,
    pageSize: number,
  ): Promise<EvidencePage> {
    const skip = (page - 1) * pageSize;
    const take = pageSize;
    const fleetScope = compact({ startDate: period.start, endDate: period.end, ...scope });
    const costWheres = () => this.fleetMetrics.buildCostSourceWheres(tenantId, fleetScope);

    switch (source) {
      case 'TRIP_REVENUE': {
        const where = this.fleetMetrics.buildRevenueSourceWhere(tenantId, fleetScope);
        const [rows, total] = await Promise.all([
          this.prisma.tripRevenue.findMany({
            where,
            orderBy: [{ receivedAt: 'desc' }, { id: 'asc' }],
            skip,
            take,
            select: { id: true, receivedAt: true, amount: true, tripId: true, description: true },
          }),
          this.prisma.tripRevenue.count({ where }),
        ]);
        return {
          total,
          items: rows.map((r) =>
            record({ id: r.id, date: r.receivedAt, amount: toNumberOrNull(r.amount), tripId: r.tripId, description: r.description }),
          ),
        };
      }
      case 'FUEL_SUPPLY': {
        const where = costWheres().fuel;
        const [rows, total] = await Promise.all([
          this.prisma.fuelSupply.findMany({
            where,
            orderBy: [{ supplyDate: 'desc' }, { id: 'asc' }],
            skip,
            take,
            select: { id: true, supplyDate: true, totalAmount: true, vehicleId: true, tripId: true, liters: true },
          }),
          this.prisma.fuelSupply.count({ where }),
        ]);
        return {
          total,
          items: rows.map((r) =>
            record({
              id: r.id,
              date: r.supplyDate,
              amount: toNumberOrNull(r.totalAmount),
              vehicleId: r.vehicleId,
              tripId: r.tripId,
              description: `${toNumberOrNull(r.liters) ?? 0} L`,
            }),
          ),
        };
      }
      case 'VEHICLE_MAINTENANCE': {
        const where = costWheres().maintenance;
        const [rows, total] = await Promise.all([
          this.prisma.vehicleMaintenance.findMany({
            where,
            orderBy: [{ openedAt: 'desc' }, { id: 'asc' }],
            skip,
            take,
            select: { id: true, openedAt: true, totalCost: true, vehicleId: true, description: true },
          }),
          this.prisma.vehicleMaintenance.count({ where }),
        ]);
        return {
          total,
          items: rows.map((r) =>
            record({ id: r.id, date: r.openedAt, amount: toNumberOrNull(r.totalCost), vehicleId: r.vehicleId, description: r.description }),
          ),
        };
      }
      case 'TIRE_PURCHASE': {
        const where = costWheres().tire;
        const [rows, total] = await Promise.all([
          this.prisma.tire.findMany({
            where,
            orderBy: [{ purchaseDate: 'desc' }, { id: 'asc' }],
            skip,
            take,
            select: { id: true, purchaseDate: true, purchasePrice: true, vehicleId: true },
          }),
          this.prisma.tire.count({ where }),
        ]);
        return {
          total,
          items: rows.map((r) =>
            record({ id: r.id, date: r.purchaseDate, amount: toNumberOrNull(r.purchasePrice), vehicleId: r.vehicleId }),
          ),
        };
      }
      case 'TIRE_RETREAD': {
        const where = costWheres().retread;
        const [rows, total] = await Promise.all([
          this.prisma.tireRetread.findMany({
            where,
            orderBy: [{ retreadDate: 'desc' }, { id: 'asc' }],
            skip,
            take,
            select: { id: true, retreadDate: true, cost: true, tire: { select: { vehicleId: true } } },
          }),
          this.prisma.tireRetread.count({ where }),
        ]);
        return {
          total,
          items: rows.map((r) =>
            record({ id: r.id, date: r.retreadDate, amount: toNumberOrNull(r.cost), vehicleId: r.tire.vehicleId }),
          ),
        };
      }
      case 'TOLL_TRANSACTION': {
        const where = costWheres().toll;
        const [rows, total] = await Promise.all([
          this.prisma.tollTransaction.findMany({
            where,
            orderBy: [{ chargedAt: 'desc' }, { id: 'asc' }],
            skip,
            take,
            select: { id: true, chargedAt: true, chargedAmount: true, vehicleId: true, tripId: true },
          }),
          this.prisma.tollTransaction.count({ where }),
        ]);
        return {
          total,
          items: rows.map((r) =>
            record({ id: r.id, date: r.chargedAt, amount: toNumberOrNull(r.chargedAmount), vehicleId: r.vehicleId, tripId: r.tripId }),
          ),
        };
      }
      case 'TRIP_EXPENSE_OTHER': {
        const where = costWheres().otherExpense;
        const [rows, total] = await Promise.all([
          this.prisma.tripExpense.findMany({
            where,
            orderBy: [{ expenseDate: 'desc' }, { id: 'asc' }],
            skip,
            take,
            select: { id: true, expenseDate: true, amount: true, vehicleId: true, tripId: true, category: true, description: true },
          }),
          this.prisma.tripExpense.count({ where }),
        ]);
        return {
          total,
          items: rows.map((r) =>
            record({
              id: r.id,
              date: r.expenseDate,
              amount: toNumberOrNull(r.amount),
              vehicleId: r.vehicleId,
              tripId: r.tripId,
              description: `${r.category}: ${r.description}`,
            }),
          ),
        };
      }
      case 'TRIP_COMPLETED': {
        const where = buildCompletedTripWhere(tenantId, scope, period);
        const [rows, total] = await Promise.all([
          this.prisma.trip.findMany({
            where,
            orderBy: [{ actualArrival: 'desc' }, { id: 'asc' }],
            skip,
            take,
            select: {
              id: true,
              actualArrival: true,
              composition: { select: { vehicleId: true } },
              origin: { select: { name: true } },
              destination: { select: { name: true } },
            },
          }),
          this.prisma.trip.count({ where }),
        ]);
        return {
          total,
          items: rows.map((r) =>
            record({
              id: r.id,
              date: r.actualArrival,
              vehicleId: r.composition?.vehicleId ?? null,
              tripId: r.id,
              description: `${r.origin.name} → ${r.destination.name}`,
            }),
          ),
        };
      }
      case 'DELIVERY_COMPLETED': {
        const where = buildCompletedDeliveryWhere(tenantId, scope, period);
        const [rows, total] = await Promise.all([
          this.prisma.tripDeliveryStop.findMany({
            where,
            orderBy: [{ deliveredAt: 'desc' }, { id: 'asc' }],
            skip,
            take,
            select: {
              id: true,
              deliveredAt: true,
              plannedArrival: true,
              actualArrival: true,
              tripId: true,
              location: { select: { name: true } },
              trip: { select: { composition: { select: { vehicleId: true } } } },
            },
          }),
          this.prisma.tripDeliveryStop.count({ where }),
        ]);
        return {
          total,
          items: rows.map((r) =>
            record({
              id: r.id,
              date: r.deliveredAt,
              vehicleId: r.trip.composition?.vehicleId ?? null,
              tripId: r.tripId,
              description:
                `${r.location.name} | previsto: ${r.plannedArrival?.toISOString() ?? 'sem previsao'}` +
                ` | chegada: ${(r.actualArrival ?? r.deliveredAt)?.toISOString() ?? '-'}`,
            }),
          ),
        };
      }
      case 'TRIP_OCCURRENCE': {
        const where = buildOccurrenceWhere(tenantId, scope, period);
        const [rows, total] = await Promise.all([
          this.prisma.tripOccurrence.findMany({
            where,
            orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
            skip,
            take,
            select: {
              id: true,
              occurredAt: true,
              vehicleId: true,
              tripId: true,
              type: true,
              severity: true,
              description: true,
              latitude: true,
              longitude: true,
              locationLabel: true,
            },
          }),
          this.prisma.tripOccurrence.count({ where }),
        ]);
        return {
          total,
          items: rows.map((r) =>
            record({
              id: r.id,
              date: r.occurredAt,
              vehicleId: r.vehicleId,
              tripId: r.tripId,
              description: `${r.type} (${r.severity}): ${r.description}`,
              severity: r.severity,
              latitude: toNumberOrNull(r.latitude),
              longitude: toNumberOrNull(r.longitude),
              locationLabel: r.locationLabel,
            }),
          ),
        };
      }
      // Fase 6 -- ledger do tanque proprio. tripId sempre null aqui: os
      // registros do tanque nao tem vinculo com viagem (so INTERNAL_FUELING
      // tem, indiretamente, via FuelSupply -- fora do escopo desta listagem).
      case 'FUEL_TANK_RECEIPT': {
        const where = buildFuelTankMovementWhere(tenantId, scope, period, FuelTankMovementType.RECEIPT);
        const [rows, total] = await Promise.all([
          this.prisma.fuelTankMovement.findMany({
            where,
            orderBy: [{ effectiveDate: 'desc' }, { id: 'asc' }],
            skip,
            take,
            select: {
              id: true,
              effectiveDate: true,
              totalAmount: true,
              quantityLiters: true,
              pricePerLiter: true,
              invoiceNumber: true,
              tank: { select: { name: true } },
            },
          }),
          this.prisma.fuelTankMovement.count({ where }),
        ]);
        return {
          total,
          items: rows.map((r) =>
            record({
              id: r.id,
              date: r.effectiveDate,
              amount: toNumberOrNull(r.totalAmount),
              description:
                `${r.tank.name}: ${toNumberOrNull(r.quantityLiters) ?? 0} L` +
                (r.pricePerLiter !== null ? ` a R$ ${toNumberOrNull(r.pricePerLiter)}/L` : '') +
                (r.invoiceNumber ? ` (NF ${r.invoiceNumber})` : ''),
            }),
          ),
        };
      }
      case 'FUEL_TANK_INTERNAL_FUELING': {
        const where = buildFuelTankMovementWhere(tenantId, scope, period, FuelTankMovementType.INTERNAL_FUELING);
        const [rows, total] = await Promise.all([
          this.prisma.fuelTankMovement.findMany({
            where,
            orderBy: [{ effectiveDate: 'desc' }, { id: 'asc' }],
            skip,
            take,
            select: { id: true, effectiveDate: true, quantityLiters: true, vehicleId: true, tripId: true, tank: { select: { name: true } } },
          }),
          this.prisma.fuelTankMovement.count({ where }),
        ]);
        return {
          total,
          items: rows.map((r) =>
            record({
              id: r.id,
              date: r.effectiveDate,
              vehicleId: r.vehicleId,
              tripId: r.tripId,
              description: `${r.tank.name}: ${toNumberOrNull(r.quantityLiters) ?? 0} L`,
            }),
          ),
        };
      }
      case 'FUEL_TANK_ADJUSTMENT': {
        const where = buildFuelTankMovementWhere(tenantId, scope, period, FuelTankMovementType.ADJUSTMENT);
        const [rows, total] = await Promise.all([
          this.prisma.fuelTankMovement.findMany({
            where,
            orderBy: [{ effectiveDate: 'desc' }, { id: 'asc' }],
            skip,
            take,
            select: { id: true, effectiveDate: true, quantityLiters: true, notes: true, tank: { select: { name: true } } },
          }),
          this.prisma.fuelTankMovement.count({ where }),
        ]);
        return {
          total,
          items: rows.map((r) =>
            record({
              id: r.id,
              date: r.effectiveDate,
              description: `${r.tank.name}: ${toNumberOrNull(r.quantityLiters) ?? 0} L${r.notes ? ` -- ${r.notes}` : ''}`,
            }),
          ),
        };
      }
      case 'FUEL_TANK_INVENTORY_CHECK': {
        const where = buildFuelTankInventoryCheckWhere(tenantId, scope, period);
        const [rows, total] = await Promise.all([
          this.prisma.fuelTankInventoryCheck.findMany({
            where,
            orderBy: [{ checkedAt: 'desc' }, { id: 'asc' }],
            skip,
            take,
            select: {
              id: true,
              checkedAt: true,
              theoreticalStockLiters: true,
              measuredStockLiters: true,
              divergenceLiters: true,
              adjusted: true,
              tank: { select: { name: true } },
            },
          }),
          this.prisma.fuelTankInventoryCheck.count({ where }),
        ]);
        return {
          total,
          items: rows.map((r) =>
            record({
              id: r.id,
              date: r.checkedAt,
              description:
                `${r.tank.name}: teorico ${toNumberOrNull(r.theoreticalStockLiters)} L, medido ${toNumberOrNull(r.measuredStockLiters)} L, ` +
                `divergencia ${toNumberOrNull(r.divergenceLiters)} L (${r.adjusted ? 'ajustado' : 'nao ajustado'})`,
            }),
          ),
        };
      }
      // Nao e uma lista de movimentacoes do periodo: 1 registro por tanque
      // do escopo, mostrando qual foi a ultima movimentacao considerada no
      // saldo (fuel_tank_stock nunca soma movimentacoes -- ver kpi-catalog).
      case 'FUEL_TANK_STOCK_SNAPSHOT': {
        const tankWhere = { tenantId, ...compact({ id: scope.tankId }) };
        const [tanks, total] = await Promise.all([
          this.prisma.fuelTank.findMany({ where: tankWhere, orderBy: { name: 'asc' }, skip, take, select: { id: true, name: true } }),
          this.prisma.fuelTank.count({ where: tankWhere }),
        ]);
        const items = await Promise.all(
          tanks.map(async (t) => {
            const movement = await this.prisma.fuelTankMovement.findFirst({
              where: { tenantId, tankId: t.id, effectiveDate: { lte: period.end } },
              orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
              select: { id: true, effectiveDate: true, newBalanceLiters: true, type: true },
            });
            return record({
              id: movement?.id ?? t.id,
              date: movement?.effectiveDate ?? null,
              amount: movement ? toNumberOrNull(movement.newBalanceLiters) : null,
              description: movement
                ? `${t.name}: saldo ${toNumberOrNull(movement.newBalanceLiters)} L (ultima movimentacao: ${movement.type})`
                : `${t.name}: sem movimentacao ate o fim do periodo`,
            });
          }),
        );
        return { total, items };
      }
    }
  }
}
