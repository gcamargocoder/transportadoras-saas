import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TripStopType } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CloseTripStopDto } from '../dto/close-trip-stop.dto';
import { CreateTripStopDto } from '../dto/create-trip-stop.dto';
import { TripStopEntity } from '../entities/trip-stop.entity';
import { toTripStopEntity } from '../mappers/trip-stop.mapper';

@Injectable()
export class TripStopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // POST /driver/trips/:id/stops -- abre uma parada. Idempotente por
  // deviceEventId (reenvio apos reconexao devolve a parada ja criada, nunca
  // duplica). vehicleId/driverId SEMPRE derivados da Trip, mesmo principio
  // ja usado em FuelSupply/TollTransaction/TripExpense.
  async open(
    tenantId: string,
    tripId: string,
    dto: CreateTripStopDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripStopEntity> {
    const existing = await this.prisma.tripStop.findFirst({
      where: { tenantId, deviceEventId: dto.deviceEventId },
    });
    if (existing) {
      return toTripStopEntity(existing);
    }

    const trip = await this.findTripOrThrow(tenantId, tripId);
    if (!trip.composition?.vehicleId) {
      throw new ConflictException('Esta viagem nao possui veiculo (composicao) vinculado.');
    }
    if (!trip.driverId) {
      throw new ConflictException('Esta viagem nao possui motorista vinculado.');
    }

    const stop = await this.prisma.tripStop.create({
      data: {
        tenantId,
        tripId,
        vehicleId: trip.composition.vehicleId,
        driverId: trip.driverId,
        type: dto.type ?? TripStopType.UNKNOWN,
        latitude: dto.latitude,
        longitude: dto.longitude,
        startedAt: new Date(dto.startedAt),
        deviceEventId: dto.deviceEventId,
        syncedAt: new Date(),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_stop.opened',
      entityName: 'TripStop',
      entityId: stop.id,
      newValue: toJsonSafe({ tripId, latitude: stop.latitude, longitude: stop.longitude }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripStopEntity(stop);
  }

  // PATCH /driver/trips/:id/stops/:stopId/close -- fecha a parada. Se ja
  // estiver fechada, e idempotente (devolve o estado atual sem recalcular)
  // -- reenvio nao deve gerar um segundo calculo de duracao.
  async close(
    tenantId: string,
    tripId: string,
    stopId: string,
    dto: CloseTripStopDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripStopEntity> {
    const before = await this.findOwnedOrThrow(tenantId, tripId, stopId);
    if (before.endedAt) {
      return toTripStopEntity(before);
    }

    const endedAt = new Date(dto.endedAt);
    const durationMinutes = Math.max(
      0,
      Math.round((endedAt.getTime() - before.startedAt.getTime()) / 60_000),
    );

    const stop = await this.prisma.tripStop.update({
      where: { id: stopId },
      data: {
        endedAt,
        durationMinutes,
        ...compact({ type: dto.type, locationLabel: dto.locationLabel }),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_stop.closed',
      entityName: 'TripStop',
      entityId: stop.id,
      newValue: toJsonSafe({ endedAt: stop.endedAt, durationMinutes: stop.durationMinutes }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripStopEntity(stop);
  }

  async findAll(tenantId: string, tripId: string): Promise<TripStopEntity[]> {
    await this.assertTripExists(tenantId, tripId);
    const stops = await this.prisma.tripStop.findMany({
      where: { tenantId, tripId },
      orderBy: { startedAt: 'desc' },
    });
    return stops.map(toTripStopEntity);
  }

  private async assertTripExists(tenantId: string, tripId: string): Promise<void> {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId, deletedAt: null } });
    if (!trip) {
      throw new NotFoundException('Viagem nao encontrada nesta empresa.');
    }
  }

  private async findTripOrThrow(tenantId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, tenantId, deletedAt: null },
      include: { composition: true },
    });
    if (!trip) {
      throw new NotFoundException('Viagem nao encontrada nesta empresa.');
    }
    return trip;
  }

  private async findOwnedOrThrow(tenantId: string, tripId: string, stopId: string) {
    const stop = await this.prisma.tripStop.findFirst({ where: { id: stopId, tenantId, tripId } });
    if (!stop) {
      throw new NotFoundException('Parada nao encontrada para esta viagem.');
    }
    return stop;
  }
}
