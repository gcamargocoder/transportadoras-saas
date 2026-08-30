import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TripStatus } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { computeAverageConsumptionKmL } from '../../common/utils/fuel-consumption.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { PlannedTripMetricsDto } from '../dto/planned-trip-metrics.dto';
import { TripMetricsEntity } from '../entities/trip-metrics.entity';
import { toTripMetricsEntity } from '../mappers/trip-metrics.mapper';
import { TripsService } from './trips.service';

// TripMetrics nasce junto com o Trip (ver TripsService.create) -- este
// service so atualiza os valores PREVISTOS (PATCH /trips/:id/metrics,
// entrada manual/planejamento). Os campos "actual*" (executado) nunca sao
// expostos para escrita manual aqui -- desde a Fase 66 sao calculados
// automaticamente por TripsService.updateActualTripMetrics ao concluir a
// viagem (actualDistanceKm via odometro inicial/final, actualFuelLiters/
// actualTollAmount/actualTotalCost reaproveitando TripSettlementsService.
// getFinancialDashboard), nunca aceitos do cliente.
@Injectable()
export class TripMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tripsService: TripsService,
  ) {}

  async findOne(tenantId: string, tripId: string): Promise<TripMetricsEntity> {
    await this.tripsService.findOwnedOrThrow(tenantId, tripId);
    const metrics = await this.prisma.tripMetrics.findUnique({ where: { tripId } });
    if (!metrics) {
      throw new NotFoundException('Metricas nao encontradas para esta viagem.');
    }
    return toTripMetricsEntity(metrics);
  }

  // Fase 116 -- ate aqui, esta era a UNICA escrita de TripMetrics.planned*
  // sem nenhuma trava de status: syncPlannedFromRoute (Fase 112, abaixo) ja
  // bloqueia apos a partida (planned e um snapshot congelado no
  // planejamento, ver docs/trip-financial-result.md), mas a entrada manual
  // aqui podia reescrever essa mesma baseline a qualquer momento, inclusive
  // com a viagem ja COMPLETED -- inconsistencia real de "o encerramento
  // preserva o historico", corrigida reaproveitando a MESMA trava/mensagem
  // ja usada por syncPlannedFromRoute (nunca uma segunda regra).
  async updatePlanned(
    tenantId: string,
    tripId: string,
    dto: PlannedTripMetricsDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripMetricsEntity> {
    const trip = await this.tripsService.findOwnedOrThrow(tenantId, tripId);
    if (
      trip.status !== TripStatus.PLANNED &&
      trip.status !== TripStatus.WAITING_DRIVER &&
      trip.status !== TripStatus.WAITING_DEPARTURE
    ) {
      throw new ConflictException(
        'Metricas previstas so podem ser editadas antes da viagem iniciar.',
      );
    }

    const before = await this.prisma.tripMetrics.findUnique({ where: { tripId } });
    if (!before) {
      throw new NotFoundException('Metricas nao encontradas para esta viagem.');
    }

    const metrics = await this.prisma.tripMetrics.update({
      where: { tripId },
      data: compact({
        plannedDistanceKm: dto.distanceKm,
        plannedDurationMin: dto.durationMin,
        plannedFuelLiters: dto.fuelLiters,
        plannedTollAmount: dto.tollAmount,
        plannedTotalCost: dto.totalCost,
      }),
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_metrics.updated',
      entityName: 'TripMetrics',
      entityId: metrics.id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(metrics),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripMetricsEntity(metrics);
  }

  // Fase 112 -- fecha o gap real "previsao de rota, distancia, tempo,
  // pedagios e custos usando os motores ja existentes": ate aqui,
  // TripMetrics.planned* era 100% entrada manual (updatePlanned acima),
  // mesmo quando a viagem ja tinha uma rota calculada (RoutingService,
  // Fase 23) com distancia/duracao/pedagio previsto REAIS. Nenhum motor
  // novo -- so preenche planned* a partir do RoutePlan atual da viagem +
  // consumo medio historico do veiculo (computeAverageConsumptionKmL, Fase
  // 18, MESMA funcao ja usada por GET /vehicles/:id/fuel-history). So
  // permitido antes da partida (nunca reescreve a baseline "prevista" depois
  // que a viagem ja esta em andamento -- ver docs/trip-financial-result.md,
  // planned e um snapshot congelado no planejamento).
  async syncPlannedFromRoute(
    tenantId: string,
    tripId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripMetricsEntity> {
    const trip = await this.tripsService.findOwnedOrThrow(tenantId, tripId);
    if (
      trip.status !== TripStatus.PLANNED &&
      trip.status !== TripStatus.WAITING_DRIVER &&
      trip.status !== TripStatus.WAITING_DEPARTURE
    ) {
      throw new ConflictException(
        'Metricas previstas so podem ser sincronizadas a partir da rota antes da viagem iniciar.',
      );
    }
    if (!trip.routePlanId) {
      throw new ConflictException('Calcule a rota da viagem antes de sincronizar as metricas previstas.');
    }

    const routePlan = await this.prisma.routePlan.findFirst({
      where: { id: trip.routePlanId, tenantId },
      select: { distanceMeters: true, durationSeconds: true, totalTollAmount: true },
    });
    if (!routePlan) {
      throw new NotFoundException('Rota planejada nao encontrada nesta empresa.');
    }

    const distanceKm = routePlan.distanceMeters / 1000;
    const durationMin = Math.round(routePlan.durationSeconds / 60);
    const tollAmount = toNumberOrNull(routePlan.totalTollAmount);

    // Fuel/custo total so quando ha historico real de abastecimento do
    // veiculo atual -- nunca inventa um consumo medio de mercado.
    const vehicleId = trip.composition?.vehicleId ?? null;
    let fuelLiters: number | null = null;
    let totalCost = tollAmount ?? 0;
    if (vehicleId) {
      const rows = await this.prisma.fuelSupply.findMany({
        where: { tenantId, vehicleId },
        select: { id: true, odometerKm: true, liters: true, totalAmount: true },
      });
      const avgKmL = computeAverageConsumptionKmL(
        rows.map((r) => ({ id: r.id, odometerKm: toNumberOrNull(r.odometerKm) ?? 0, liters: toNumberOrNull(r.liters) ?? 0 })),
      );
      if (avgKmL !== null && avgKmL > 0) {
        fuelLiters = distanceKm / avgKmL;
        const totalLiters = rows.reduce((sum, r) => sum + (toNumberOrNull(r.liters) ?? 0), 0);
        const totalAmount = rows.reduce((sum, r) => sum + (toNumberOrNull(r.totalAmount) ?? 0), 0);
        const avgPricePerLiter = totalLiters > 0 ? totalAmount / totalLiters : null;
        if (avgPricePerLiter !== null) {
          totalCost += fuelLiters * avgPricePerLiter;
        }
      }
    }

    const before = await this.prisma.tripMetrics.findUnique({ where: { tripId } });
    if (!before) {
      throw new NotFoundException('Metricas nao encontradas para esta viagem.');
    }

    const metrics = await this.prisma.tripMetrics.update({
      where: { tripId },
      data: {
        plannedDistanceKm: distanceKm,
        plannedDurationMin: durationMin,
        plannedFuelLiters: fuelLiters,
        plannedTollAmount: tollAmount,
        plannedTotalCost: tollAmount !== null || fuelLiters !== null ? totalCost : null,
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_metrics.synced_from_route',
      entityName: 'TripMetrics',
      entityId: metrics.id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(metrics),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripMetricsEntity(metrics);
  }
}
