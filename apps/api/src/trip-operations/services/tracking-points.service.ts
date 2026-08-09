import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RoutingService } from '../../routing/services/routing.service';
import { CreateTrackingPointsDto } from '../dto/create-tracking-points.dto';
import { TrackingPointEntity, TrackingPointsSyncResultEntity } from '../entities/tracking-point.entity';
import { toTrackingPointEntity } from '../mappers/tracking-point.mapper';

@Injectable()
export class TrackingPointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routingService: RoutingService,
  ) {}

  // POST /driver/trips/:id/locations -- lote idempotente por deviceEventId
  // (createMany + skipDuplicates): reenviar o mesmo ponto apos reconexao
  // nunca duplica nem gera erro. Nao ha "sincronizacao parcial com falha"
  // nesta fase -- ou o lote inteiro e aceito (pontos novos gravados, os ja
  // conhecidos ignorados), ou a viagem nao existe (404).
  async createBatch(
    tenantId: string,
    tripId: string,
    dto: CreateTrackingPointsDto,
  ): Promise<TrackingPointsSyncResultEntity> {
    await this.assertTripExists(tenantId, tripId);

    const result = await this.prisma.trackingPoint.createMany({
      data: dto.points.map((point) => ({
        tenantId,
        tripId,
        latitude: point.latitude,
        longitude: point.longitude,
        speedKmh: point.speedKmh ?? null,
        headingDeg: point.headingDeg ?? null,
        recordedAt: new Date(point.recordedAt),
        deviceEventId: point.deviceEventId,
        syncedAt: new Date(),
      })),
      skipDuplicates: true,
    });

    // Deteccao de desvio (Fase 26) -- so quando ha ponto novo de fato (um
    // reenvio 100% duplicado nao muda nada, nao vale a pena reavaliar).
    // Nunca bloqueia a resposta ao app do motorista: uma falha aqui (ex:
    // provider indisponivel nao importa, checkDeviation nao chama o
    // provider) nao pode impedir o registro da localizacao em si.
    if (result.count > 0) {
      await this.routingService.checkDeviation(tenantId, tripId).catch(() => undefined);
    }

    const entity = new TrackingPointsSyncResultEntity();
    entity.received = dto.points.length;
    entity.created = result.count;
    entity.duplicates = dto.points.length - result.count;
    return entity;
  }

  // GET /trips/:id/locations (admin, Fase 25) -- historico recente, sem
  // paginacao completa: suficiente para visualizacao basica sem mapa (ver
  // secao 20 da fase). limit protege contra viagens com milhares de pontos.
  async findRecent(tenantId: string, tripId: string, limit = 200): Promise<TrackingPointEntity[]> {
    await this.assertTripExists(tenantId, tripId);

    const points = await this.prisma.trackingPoint.findMany({
      where: { tenantId, tripId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });
    return points.map(toTrackingPointEntity);
  }

  // Ultima posicao conhecida -- usado tanto no resumo de retomada do app do
  // motorista (GET /driver/trips/active) quanto no summary administrativo.
  async findLast(tenantId: string, tripId: string): Promise<TrackingPointEntity | null> {
    const point = await this.prisma.trackingPoint.findFirst({
      where: { tenantId, tripId },
      orderBy: { recordedAt: 'desc' },
    });
    return point ? toTrackingPointEntity(point) : null;
  }

  private async assertTripExists(tenantId: string, tripId: string): Promise<void> {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId, deletedAt: null } });
    if (!trip) {
      throw new NotFoundException('Viagem nao encontrada nesta empresa.');
    }
  }
}
