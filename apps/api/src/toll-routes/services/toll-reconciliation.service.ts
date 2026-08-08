import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TollPlaza, TollTransaction } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { TollReconciliationDashboardEntity } from '../entities/toll-reconciliation-dashboard.entity';
import { TollReconciliationEntity } from '../entities/toll-reconciliation.entity';
import {
  computeTollReconciliation,
  TollReconciliationResult,
} from '../utils/toll-reconciliation.util';

const RECONCILIATION_TRIP_INCLUDE = {
  composition: { include: { axleConfiguration: true } },
  tollRoute: {
    include: {
      stops: { include: { tollPlaza: true }, orderBy: { sequence: 'asc' } },
    },
  },
} satisfies Prisma.TripInclude;

type ReconciliationTrip = Prisma.TripGetPayload<{ include: typeof RECONCILIATION_TRIP_INCLUDE }>;
type TransactionWithPlaza = TollTransaction & { tollPlaza: TollPlaza };

@Injectable()
export class TollReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  // GET /trips/:id/toll-reconciliation -- monta as entradas (paradas
  // esperadas da rota + pedagios registrados na viagem) a partir do banco e
  // delega o calculo em si para computeTollReconciliation(), funcao pura
  // reutilizada tambem pelos testes unitarios. Reaproveita o motor de
  // conferencia da Fase 22 (computeAuditVerdict) -- nunca duplica essa logica.
  async getReconciliation(tenantId: string, tripId: string): Promise<TollReconciliationEntity> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, tenantId, deletedAt: null },
      include: RECONCILIATION_TRIP_INCLUDE,
    });
    if (!trip) {
      throw new NotFoundException('Viagem nao encontrada nesta empresa.');
    }

    const transactions = trip.tollRoute
      ? await this.prisma.tollTransaction.findMany({
          where: { tenantId, tripId },
          include: { tollPlaza: true },
          orderBy: { chargedAt: 'asc' },
        })
      : [];

    return this.toReconciliationEntity(trip, transactions);
  }

  // GET /toll-routes/dashboard -- agrega a conciliacao de TODAS as viagens
  // do tenant com rota vinculada, reaproveitando exatamente o mesmo motor
  // (computeTollReconciliation) usado na conciliacao individual, viagem a
  // viagem, sem introduzir uma segunda formula de agregacao.
  async getDashboard(tenantId: string): Promise<TollReconciliationDashboardEntity> {
    const trips = await this.prisma.trip.findMany({
      where: { tenantId, deletedAt: null, tollRouteId: { not: null } },
      include: RECONCILIATION_TRIP_INCLUDE,
    });

    const transactions = trips.length
      ? await this.prisma.tollTransaction.findMany({
          where: { tenantId, tripId: { in: trips.map((trip) => trip.id) } },
          include: { tollPlaza: true },
        })
      : [];
    const transactionsByTrip = new Map<string, TransactionWithPlaza[]>();
    for (const tx of transactions) {
      const list = transactionsByTrip.get(tx.tripId) ?? [];
      list.push(tx);
      transactionsByTrip.set(tx.tripId, list);
    }

    const results = trips.map((trip) =>
      this.computeResult(trip, transactionsByTrip.get(trip.id) ?? []),
    );

    const dashboard = new TollReconciliationDashboardEntity();
    dashboard.totalTripsWithRoute = results.length;
    dashboard.reconciledTripsCount = results.filter((r) => r.isFullyReconciled).length;
    dashboard.nonReconciledTripsCount = results.filter((r) => !r.isFullyReconciled).length;
    dashboard.totalExpectedStops = sum(results.map((r) => r.expectedStopsCount));
    dashboard.totalRegisteredStops = sum(results.map((r) => r.registeredStopsCount));
    dashboard.totalNotRegisteredStops = sum(
      results.map((r) => r.stops.filter((s) => s.verdict === 'NOT_REGISTERED').length),
    );
    dashboard.totalUnplannedTransactions = sum(results.map((r) => r.unplannedTransactions.length));
    dashboard.totalUnplannedAmount = round2(sum(results.map((r) => r.unplannedTotalAmount)));
    dashboard.totalExpectedAmount = round2(sum(results.map((r) => r.expectedTotalAmount)));
    dashboard.totalChargedAmount = round2(sum(results.map((r) => r.chargedTotalAmount)));
    dashboard.totalDivergenceAmount = round2(
      dashboard.totalChargedAmount - dashboard.totalExpectedAmount,
    );

    const totalReconciledStops = sum(results.map((r) => r.reconciledStopsCount));
    const totalCorrectStops = sum(
      results.map((r) => r.stops.filter((s) => s.verdict === 'CORRECT').length),
    );
    dashboard.conformityPercentage =
      totalReconciledStops > 0 ? round2((totalCorrectStops / totalReconciledStops) * 100) : 0;

    return dashboard;
  }

  private toReconciliationEntity(
    trip: ReconciliationTrip,
    transactions: TransactionWithPlaza[],
  ): TollReconciliationEntity {
    const entity = new TollReconciliationEntity();
    entity.tripId = trip.id;

    if (!trip.tollRoute) {
      entity.hasRoute = false;
      entity.tollRouteId = null;
      entity.tollRouteName = null;
      entity.originLabel = null;
      entity.destinationLabel = null;
      entity.stops = [];
      entity.unplannedTransactions = [];
      entity.expectedStopsCount = 0;
      entity.registeredStopsCount = 0;
      entity.reconciledStopsCount = 0;
      entity.expectedTotalAmount = 0;
      entity.chargedTotalAmount = 0;
      entity.divergenceAmount = 0;
      entity.unplannedTotalAmount = 0;
      entity.conformityPercentage = 0;
      entity.isFullyReconciled = false;
      return entity;
    }

    const result = this.computeResult(trip, transactions);

    entity.hasRoute = true;
    entity.tollRouteId = trip.tollRoute.id;
    entity.tollRouteName = trip.tollRoute.name;
    entity.originLabel = trip.tollRoute.originLabel;
    entity.destinationLabel = trip.tollRoute.destinationLabel;
    entity.stops = result.stops;
    entity.unplannedTransactions = result.unplannedTransactions;
    entity.expectedStopsCount = result.expectedStopsCount;
    entity.registeredStopsCount = result.registeredStopsCount;
    entity.reconciledStopsCount = result.reconciledStopsCount;
    entity.expectedTotalAmount = result.expectedTotalAmount;
    entity.chargedTotalAmount = result.chargedTotalAmount;
    entity.divergenceAmount = result.divergenceAmount;
    entity.unplannedTotalAmount = result.unplannedTotalAmount;
    entity.conformityPercentage = result.conformityPercentage;
    entity.isFullyReconciled = result.isFullyReconciled;

    return entity;
  }

  private computeResult(
    trip: ReconciliationTrip,
    transactions: TransactionWithPlaza[],
  ): TollReconciliationResult {
    const axleCount = trip.composition?.axleConfiguration?.totalAxles ?? null;
    return computeTollReconciliation(
      (trip.tollRoute?.stops ?? []).map((stop) => ({
        sequence: stop.sequence,
        tollPlazaId: stop.tollPlaza.id,
        tollPlazaName: stop.tollPlaza.name,
        highway: stop.tollPlaza.highway,
        pricePerAxle: toNumberOrNull(stop.tollPlaza.pricePerAxle),
      })),
      transactions.map((tx) => ({
        id: tx.id,
        tollPlazaId: tx.tollPlazaId,
        tollPlazaName: tx.tollPlaza.name,
        chargedAmount: toNumberOrNull(tx.chargedAmount) ?? 0,
        chargedAt: tx.chargedAt,
      })),
      axleCount,
    );
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
