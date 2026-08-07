import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseStatus, Prisma, SettlementStatus } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CloseTripSettlementDto } from '../dto/close-trip-settlement.dto';
import { TripFinancialDashboardEntity } from '../entities/trip-financial-dashboard.entity';
import { TripSettlementEntity } from '../entities/trip-settlement.entity';
import {
  toTripSettlementEntity,
  TripSettlementWithRelations,
} from '../mappers/trip-settlement.mapper';

const SETTLEMENT_INCLUDE = { closer: true } satisfies Prisma.TripSettlementInclude;

interface Totals {
  totalRevenue: number;
  totalExpenses: number;
  totalAdvances: number;
  netResult: number;
}

@Injectable()
export class TripSettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // GET /trips/:id/settlement -- se ja existe um fechamento (CLOSED ou
  // REOPENED), retorna o SNAPSHOT congelado no ultimo fechamento (nunca
  // recalculado ao vivo -- e literalmente "o que foi fechado"). Se a
  // viagem nunca foi fechada, calcula os totais ao vivo como preview
  // (status OPEN, sem persistir nada).
  async getSettlement(tenantId: string, tripId: string): Promise<TripSettlementEntity> {
    await this.findTripOrThrow(tenantId, tripId);

    const existing = await this.findSettlementRow(tenantId, tripId);
    if (existing) {
      return toTripSettlementEntity(tripId, existing, {
        totalRevenue: Number(existing.totalRevenue),
        totalExpenses: Number(existing.totalExpenses),
        totalAdvances: Number(existing.totalAdvances),
        netResult: Number(existing.netResult),
      });
    }

    const liveTotals = await this.computeTotals(tenantId, tripId);
    return toTripSettlementEntity(tripId, null, liveTotals);
  }

  // POST /trips/:id/settlement/close -- permitido a partir de OPEN (nunca
  // fechada) ou REOPENED; bloqueado se ja CLOSED (reabra antes de fechar de
  // novo). Recalcula os totais ao vivo e os congela no snapshot. Resultado
  // negativo NUNCA bloqueia o fechamento.
  async close(
    tenantId: string,
    tripId: string,
    dto: CloseTripSettlementDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripSettlementEntity> {
    await this.findTripOrThrow(tenantId, tripId);

    const existing = await this.findSettlementRow(tenantId, tripId);
    if (existing && existing.status === SettlementStatus.CLOSED) {
      throw new ConflictException(
        'Este fechamento ja esta CLOSED. Reabra (POST /trips/:id/settlement/reopen) antes de fechar novamente.',
      );
    }

    const totals = await this.computeTotals(tenantId, tripId);
    const closedAt = new Date();
    const data = {
      totalRevenue: totals.totalRevenue,
      totalExpenses: totals.totalExpenses,
      totalAdvances: totals.totalAdvances,
      netResult: totals.netResult,
      status: SettlementStatus.CLOSED,
      closedBy: actor.userId,
      closedAt,
      ...compact({ notes: dto.notes }),
    };

    const settlement = existing
      ? await this.prisma.tripSettlement.update({
          where: { id: existing.id },
          data,
          include: SETTLEMENT_INCLUDE,
        })
      : await this.prisma.tripSettlement.create({
          data: { tenantId, tripId, ...data },
          include: SETTLEMENT_INCLUDE,
        });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_settlement.closed',
      entityName: 'TripSettlement',
      entityId: settlement.id,
      previousValue: existing ? toJsonSafe(existing) : null,
      newValue: toJsonSafe(settlement),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripSettlementEntity(tripId, settlement, totals);
  }

  // POST /trips/:id/settlement/reopen -- so permitido a partir de CLOSED.
  // Altera APENAS o status; totais/closedBy/closedAt/notes do ultimo
  // fechamento sao preservados integralmente (nunca apaga historico).
  async reopen(
    tenantId: string,
    tripId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripSettlementEntity> {
    await this.findTripOrThrow(tenantId, tripId);

    const existing = await this.findSettlementRow(tenantId, tripId);
    if (!existing || existing.status !== SettlementStatus.CLOSED) {
      throw new ConflictException('Somente um fechamento CLOSED pode ser reaberto.');
    }

    const settlement = await this.prisma.tripSettlement.update({
      where: { id: existing.id },
      data: { status: SettlementStatus.REOPENED },
      include: SETTLEMENT_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_settlement.reopened',
      entityName: 'TripSettlement',
      entityId: settlement.id,
      previousValue: { status: existing.status },
      newValue: { status: settlement.status },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripSettlementEntity(tripId, settlement, {
      totalRevenue: Number(settlement.totalRevenue),
      totalExpenses: Number(settlement.totalExpenses),
      totalAdvances: Number(settlement.totalAdvances),
      netResult: Number(settlement.netResult),
    });
  }

  // GET /trips/:id/financial-dashboard -- 3 agregacoes em paralelo (sem
  // N+1); despesas consideram apenas status APPROVED (mesma regra do
  // fechamento).
  async getFinancialDashboard(
    tenantId: string,
    tripId: string,
  ): Promise<TripFinancialDashboardEntity> {
    await this.findTripOrThrow(tenantId, tripId);

    const [revenueAgg, expenseAgg, advanceAgg] = await Promise.all([
      this.prisma.tripRevenue.aggregate({
        where: { tenantId, tripId },
        _sum: { amount: true },
        _count: { _all: true },
        _max: { amount: true },
      }),
      this.prisma.tripExpense.aggregate({
        where: { tenantId, tripId, status: ExpenseStatus.APPROVED },
        _sum: { amount: true },
        _count: { _all: true },
        _max: { amount: true },
      }),
      this.prisma.tripAdvance.aggregate({
        where: { tenantId, tripId },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const totalRevenue = Number(revenueAgg._sum.amount ?? 0);
    const totalExpenses = Number(expenseAgg._sum.amount ?? 0);
    const totalAdvances = Number(advanceAgg._sum.amount ?? 0);
    const profit = totalRevenue - totalExpenses;
    const netResult = profit - totalAdvances;

    const entity = new TripFinancialDashboardEntity();
    entity.tripId = tripId;
    entity.totalRevenue = totalRevenue;
    entity.totalExpenses = totalExpenses;
    entity.totalAdvances = totalAdvances;
    entity.profit = profit;
    entity.netResult = netResult;
    entity.marginPercentage = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
    entity.revenueCount = revenueAgg._count._all;
    entity.expenseCount = expenseAgg._count._all;
    entity.advanceCount = advanceAgg._count._all;
    entity.entryCount = entity.revenueCount + entity.expenseCount + entity.advanceCount;
    entity.largestExpense = Number(expenseAgg._max.amount ?? 0);
    entity.largestRevenue = Number(revenueAgg._max.amount ?? 0);
    return entity;
  }

  private async computeTotals(tenantId: string, tripId: string): Promise<Totals> {
    const [revenueAgg, expenseAgg, advanceAgg] = await Promise.all([
      this.prisma.tripRevenue.aggregate({ where: { tenantId, tripId }, _sum: { amount: true } }),
      this.prisma.tripExpense.aggregate({
        where: { tenantId, tripId, status: ExpenseStatus.APPROVED },
        _sum: { amount: true },
      }),
      this.prisma.tripAdvance.aggregate({ where: { tenantId, tripId }, _sum: { amount: true } }),
    ]);

    const totalRevenue = Number(revenueAgg._sum.amount ?? 0);
    const totalExpenses = Number(expenseAgg._sum.amount ?? 0);
    const totalAdvances = Number(advanceAgg._sum.amount ?? 0);
    return {
      totalRevenue,
      totalExpenses,
      totalAdvances,
      netResult: totalRevenue - totalExpenses - totalAdvances,
    };
  }

  // Nunca findUnique sem tenant -- tripId e @unique no banco, mas a
  // checagem explicita de tenantId aqui e obrigatoria (ver
  // docs/SECURITY_AND_DEVELOPMENT_STANDARDS.md, secao Multi-Tenant).
  private async findSettlementRow(
    tenantId: string,
    tripId: string,
  ): Promise<TripSettlementWithRelations | null> {
    return this.prisma.tripSettlement.findFirst({
      where: { tripId, tenantId },
      include: SETTLEMENT_INCLUDE,
    });
  }

  private async findTripOrThrow(tenantId: string, tripId: string): Promise<void> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, tenantId, deletedAt: null },
    });
    if (!trip) {
      throw new NotFoundException('Viagem (tripId) nao encontrada nesta empresa.');
    }
  }
}
