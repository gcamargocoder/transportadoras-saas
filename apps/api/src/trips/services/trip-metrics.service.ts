import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { PlannedTripMetricsDto } from '../dto/planned-trip-metrics.dto';
import { TripMetricsEntity } from '../entities/trip-metrics.entity';
import { toTripMetricsEntity } from '../mappers/trip-metrics.mapper';
import { TripsService } from './trips.service';

// TripMetrics nasce junto com o Trip (ver TripsService.create) -- este
// service so atualiza os valores PREVISTOS. Campos "actual*" nao sao
// expostos para escrita nesta fase (ficam vazios ate rastreamento/
// telemetria/pedagio existirem).
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

  async updatePlanned(
    tenantId: string,
    tripId: string,
    dto: PlannedTripMetricsDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripMetricsEntity> {
    await this.tripsService.findOwnedOrThrow(tenantId, tripId);

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
}
